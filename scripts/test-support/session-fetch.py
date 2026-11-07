import http.cookiejar
from http.cookies import SimpleCookie
from email.utils import parsedate_to_datetime
import tempfile
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.parse

from curl_cffi import requests, CurlHttpVersion, CurlOpt

MAX_BYTES = 4 * 1024 * 1024
SESSION_METRICS = {}
# Manual integration checks must supply a new private directory, never an imported jar.
SESSION_FILE = os.environ.get('AI_OVERVIEW_SESSION_FILE')
USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) mgbrowser/0.9.32'


class DriverError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def access_state(response):
    status = response['status']
    if status in (403, 429) or (status == 200 and re.search(r'Our systems have detected unusual traffic from your computer network|id=["\x27]captcha-form["\x27]', response['body'], re.I)):
        return {'kind': 'blocked', 'status': status}
    if status in (301, 302, 303, 307, 308):
        target = urllib.parse.urlsplit(urllib.parse.urljoin(response['url'], response['headers'].get('Location', '')))
        kind = 'redirect'
        if target.scheme == 'https' and target.hostname in ('www.google.com', 'google.com') and target.path.startswith('/sorry'):
            kind = 'blocked'
        elif target.scheme == 'https' and target.hostname in ('www.google.com.hk', 'google.com.hk') and target.path in ('/url', '/search'):
            kind = 'regional-redirect'
        return {'kind': kind, 'status': status}
    return None


def classified(response):
    access = access_state(response)
    response['headers'].pop('Location', None)
    if access:
        response['access'] = access
    return response


def checked_url(value, original=None):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != 'https' or parsed.netloc != 'www.google.com' or parsed.path != '/search' or parsed.fragment:
        raise ValueError('Only https://www.google.com/search is supported')
    if original:
        before = urllib.parse.parse_qs(urllib.parse.urlsplit(original).query, keep_blank_values=True)
        after = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        if any(after.get(key) != values for key, values in before.items()):
            raise ValueError('Bootstrap changed Search parameters')
        if set(after) - set(before) - {'sei', 'sg_ss'}:
            raise ValueError('Unexpected bootstrap parameters')
    return value


def request(session, url, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Search deadline exceeded')
    stage_started = time.monotonic()
    response = session.get(url, timeout=remaining, allow_redirects=False)
    SESSION_METRICS.setdefault('httpStages', []).append({'status': response.status_code, 'durationMs': round((time.monotonic()-stage_started)*1000, 2), 'bytes': len(response.content)})
    if len(response.content) > MAX_BYTES:
        raise ValueError('Search response exceeds size limit')
    return {
        'status': response.status_code,
        'url': response.url,
        'headers': {key: response.headers[key] for key in ['Content-Type', 'Retry-After', 'Location'] if key in response.headers},
        'body': response.content.decode('utf-8', errors='replace'),
    }


def apply_bootstrap_cookie(jar, write):
    if not isinstance(write, str) or any(c in write for c in '\r\n'):
        raise ValueError('Invalid bootstrap cookie')
    parsed = SimpleCookie()
    parsed.load(write)
    if list(parsed) != ['SG_SS']:
        raise ValueError('Unexpected bootstrap cookie')
    morsel = parsed['SG_SS']
    value = morsel.value
    domain = morsel['domain'].lstrip('.') or 'www.google.com'
    path = morsel['path'] or '/'
    if domain not in ('www.google.com', 'google.com') or path != '/' or morsel['httponly'] or any(ord(c) < 33 or ord(c) > 126 or c in ';,' for c in value):
        raise ValueError('Invalid bootstrap cookie scope/value')
    max_age = morsel['max-age']
    expires = None
    SESSION_METRICS.setdefault('bootstrapCookieExpiryModes', []).append('max-age' if max_age else 'expires' if morsel['expires'] else 'session')
    if max_age:
        if not re.fullmatch(r'-?\d+', max_age):
            raise ValueError('Invalid bootstrap cookie max-age')
        expires = int(time.time()) + int(max_age)
        SESSION_METRICS.setdefault('bootstrapCookieMaxAgeSeconds', []).append(int(max_age))
    elif morsel['expires']:
        expires = int(parsedate_to_datetime(morsel['expires']).timestamp())
    SESSION_METRICS['bootstrapCookieWrites'] = SESSION_METRICS.get('bootstrapCookieWrites', 0) + 1
    if not value or (expires is not None and expires <= time.time()):
        for old in list(jar):
            if old.name == 'SG_SS' and old.domain.lstrip('.') == domain and old.path == path:
                jar.clear(old.domain, old.path, old.name)
        return
    jar.set_cookie(http.cookiejar.Cookie(version=0, name='SG_SS', value=value, port=None, port_specified=False,
        domain=domain, domain_specified=bool(morsel['domain']), domain_initial_dot=False,
        path=path, path_specified=bool(morsel['path']), secure=bool(morsel['secure']),
        expires=expires, discard=expires is None, comment=None, comment_url=None, rest={}, rfc2109=False))


def fetch(url, executable):
    checked_url(url)
    executable = str(Path(executable).resolve(strict=True))
    started = time.monotonic()
    deadline = started + 19
    if not SESSION_FILE:
        raise ValueError('Expected private session file')
    saved_jar = http.cookiejar.LWPCookieJar(SESSION_FILE)
    try:
        saved_jar.load(ignore_discard=True, ignore_expires=False)
    except FileNotFoundError:
        pass
    for cookie in list(saved_jar):
        if cookie.domain.lstrip('.') not in ('google.com', 'www.google.com'):
            saved_jar.clear(cookie.domain, cookie.path, cookie.name)
    saved_jar.clear_expired_cookies()
    SESSION_METRICS['sessionCookiesBefore'] = len(saved_jar)
    session = requests.Session(cookies=saved_jar, trust_env=False, http_version=CurlHttpVersion.V1_1, curl_options={CurlOpt.IPRESOLVE: 1}, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close',
    })
    try:
        jar = session.cookies.jar
        SESSION_METRICS['bootstrapExecuted'] = False
        first = request(session, url, deadline)
        if access_state(first):
            return classified(first)
        result = first
        metrics = {'initialStatus': first['status'], 'bootstrapExecuted': False}
        html = first['body']
        if first['status'] == 200 and 'knitsail' in html and 'var challenge_version=' in html:
            readable = '; '.join(cookie.name + '=' + cookie.value for cookie in jar if not cookie.has_nonstandard_attr('HttpOnly') and not cookie.has_nonstandard_attr('httponly'))
            SESSION_METRICS['bootstrapExecuted'] = True
            bootstrap_started = time.monotonic()
            payload = json.dumps({'url': url, 'html': html, 'initialCookies': readable, 'cryptoSeed': list(os.urandom(32))})
            process = subprocess.Popen([executable], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                stdout, stderr = process.communicate(payload, timeout=min(10, max(0.01, deadline - time.monotonic())))
                if process.returncode:
                    raise DriverError('BOOTSTRAP_FAILED')
                if len(stdout) > 128 * 1024:
                    raise ValueError('Bootstrap output exceeds size limit')
                computed = json.loads(stdout)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
            SESSION_METRICS['bootstrapWallMs'] = round((time.monotonic()-bootstrap_started)*1000, 2)
            if computed.get('errors') or computed.get('engine', {}).get('fatal_reason') or computed.get('fetchRequestsNotExecuted'):
                raise DriverError('BOOTSTRAP_INCOMPLETE')
            target = computed.get('navigationUrl')
            if not target:
                raise DriverError('BOOTSTRAP_NO_NAVIGATION')
            checked_url(target, url)
            for write in computed.get('cookieWrites', []):
                apply_bootstrap_cookie(session.cookies.jar, write)
            result = request(session, target, deadline)
            metrics.update({'bootstrapExecuted': True, 'bootstrapMs': computed['elapsedMs'], 'runtime': computed['runtime']})
        metrics['totalMs'] = round((time.monotonic() - started) * 1000)
        result['metrics'] = metrics
        return classified(result)
    finally:
        # Keep the same anonymous identity even after a denial; never reset it to retry.
        current = list(session.cookies.jar)
        saved_jar.clear()
        for cookie in current:
            if cookie.domain.lstrip('.') in ('google.com', 'www.google.com'):
                saved_jar.set_cookie(cookie)
        saved_jar.clear_expired_cookies()
        SESSION_METRICS['sessionCookiesAfter'] = len(saved_jar)
        SESSION_METRICS['httpRequestCount'] = len(SESSION_METRICS.get('httpStages', []))
        SESSION_METRICS['totalWallMs'] = round((time.monotonic()-started)*1000, 2)
        descriptor, temporary = tempfile.mkstemp(prefix='overview-session-', dir=str(Path(SESSION_FILE).parent))
        os.close(descriptor)
        try:
            saved_jar.save(temporary, ignore_discard=True, ignore_expires=False)
            os.chmod(temporary, 0o600)
            os.replace(temporary, SESSION_FILE)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
            session.close()
            profile = os.environ.get('AI_OVERVIEW_PROFILE_FILE')
            if profile:
                descriptor = os.open(profile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(descriptor, 'w') as handle:
                    json.dump(SESSION_METRICS, handle)


def terminate(signum, frame):
    raise KeyboardInterrupt('Search cancelled')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, terminate)
    try:
        if len(sys.argv) != 3:
            raise ValueError('Expected Search URL and bootstrap executable')
        print(json.dumps(fetch(sys.argv[1], sys.argv[2])))
    except Exception as error:
        code = error.code if isinstance(error, DriverError) else 'RUNTIME_TIMEOUT' if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)) or getattr(error, 'code', None) == 28 else 'INVALID_RESPONSE' if isinstance(error, (ValueError, json.JSONDecodeError)) else 'NETWORK_ERROR'
        print(json.dumps({'error': {'type': type(error).__name__, 'code': code}}))
        sys.exit(1)
