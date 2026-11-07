import json
import http.cookiejar
from http.cookies import SimpleCookie
from email.utils import parsedate_to_datetime
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
USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) mgbrowser/0.9.32'


def http_only(cookie):
    # curl_cffi 0.17.0 uses http_only='True'/'False', unlike stdlib jars.
    return (cookie.has_nonstandard_attr('HttpOnly') or cookie.has_nonstandard_attr('httponly')
            or str(cookie.get_nonstandard_attr('http_only', '')).lower() == 'true')


def apply_bootstrap_cookie(jar, write):
    if not isinstance(write, str) or any(c in write for c in '\r\n'):
        raise ValueError('Invalid bootstrap cookie')
    parsed = SimpleCookie()
    parsed.load(write)
    if list(parsed) != ['SG_SS']:
        raise ValueError('Unexpected bootstrap cookie')
    morsel = parsed['SG_SS']
    domain = morsel['domain'].lstrip('.') or 'www.google.com'
    path = morsel['path'] or '/'
    value = morsel.value
    if domain not in ('www.google.com', 'google.com') or path != '/' or morsel['httponly'] or any(ord(c) < 33 or ord(c) > 126 or c in ';,' for c in value):
        raise ValueError('Invalid bootstrap cookie scope/value')
    if any(c.name == 'SG_SS' and c.domain.lstrip('.') == domain and c.path == path and http_only(c) for c in jar):
        raise ValueError('Cannot overwrite HttpOnly bootstrap cookie')
    expires = None
    if morsel['max-age']:
        if not re.fullmatch(r'-?\d+', morsel['max-age']):
            raise ValueError('Invalid bootstrap cookie max-age')
        expires = int(time.time()) + int(morsel['max-age'])
    elif morsel['expires']:
        expires = int(parsedate_to_datetime(morsel['expires']).timestamp())
    if not value or (expires is not None and expires <= time.time()):
        for old in list(jar):
            if old.name == 'SG_SS' and old.domain.lstrip('.') == domain and old.path == path:
                jar.clear(old.domain, old.path, old.name)
        return
    jar.set_cookie(http.cookiejar.Cookie(0, 'SG_SS', value, None, False, domain,
        bool(morsel['domain']), False, path, bool(morsel['path']), bool(morsel['secure']),
        expires, expires is None, None, None, {}, False))


def restore_cookies(rows):
    if not isinstance(rows, list) or len(rows) > 64 or len(json.dumps(rows)) > 65536:
        raise ValueError('Invalid anonymous session')
    jar = http.cookiejar.CookieJar()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'name', 'value', 'domain', 'domainSpecified', 'path', 'secure', 'expires', 'httpOnly'}:
            raise ValueError('Invalid anonymous cookie')
        name, value, domain, path = (row[key] for key in ('name', 'value', 'domain', 'path'))
        if not all(isinstance(v, str) for v in (name, value, domain, path)) or not name or len(name) + len(value) > 8192:
            raise ValueError('Invalid anonymous cookie value')
        if domain.lstrip('.') not in ('google.com', 'www.google.com') or path != '/' or any(c in name + value for c in '\r\n;') or '=' in name:
            raise ValueError('Invalid anonymous cookie scope')
        if any(type(row[key]) is not bool for key in ('domainSpecified', 'secure', 'httpOnly')) or (row['expires'] is not None and (type(row['expires']) is not int or abs(row['expires']) > 2**53 - 1)):
            raise ValueError('Invalid anonymous cookie attributes')
        jar.set_cookie(http.cookiejar.Cookie(0, name, value, None, False, domain, row['domainSpecified'],
            domain.startswith('.'), path, True, row['secure'], row['expires'], row['expires'] is None,
            None, None, {'HttpOnly': None} if row['httpOnly'] else {}, False))
    jar.clear_expired_cookies()
    return jar


def export_cookies(jar):
    jar.clear_expired_cookies()
    rows = [{'name': c.name, 'value': c.value, 'domain': c.domain, 'domainSpecified': c.domain_specified,
             'path': c.path, 'secure': c.secure, 'expires': c.expires,
             'httpOnly': http_only(c)}
            for c in jar if c.domain.lstrip('.') in ('google.com', 'www.google.com') and c.path == '/']
    # Validate our own response and bound the private IPC payload as well as its input.
    restore_cookies(rows)
    return rows


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
    response = session.get(url, timeout=remaining, allow_redirects=False)
    if len(response.content) > MAX_BYTES:
        raise ValueError('Search response exceeds size limit')
    return {
        'status': response.status_code,
        'url': response.url,
        'headers': {key: response.headers[key] for key in ['Content-Type', 'Retry-After', 'Location'] if key in response.headers},
        'body': response.content.decode('utf-8', errors='replace'),
    }


def fetch(url, executable, cookies=None):
    checked_url(url)
    executable = str(Path(executable).resolve(strict=True))
    ip_family = os.environ.get('AI_SEARCH_OVERVIEW_IP_FAMILY', 'auto')
    if ip_family not in ('auto', 'ipv4', 'ipv6'):
        raise ValueError('IP family must be auto, ipv4 or ipv6')
    # libcurl IPRESOLVE: whichever, IPv4, IPv6. Explicit IPv4/IPv6 choices stay fixed.
    ip_resolve = {'auto': 0, 'ipv4': 1, 'ipv6': 2}[ip_family]
    started = time.monotonic()
    deadline = started + 19
    session = requests.Session(cookies=cookies, trust_env=False, http_version=CurlHttpVersion.V1_1, curl_options={CurlOpt.IPRESOLVE: ip_resolve}, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close',
    })
    try:
        jar = session.cookies.jar
        first = request(session, url, deadline)
        if access_state(first):
            return classified(first)
        result = first
        metrics = {'initialStatus': first['status'], 'bootstrapExecuted': False}
        html = first['body']
        if first['status'] == 200 and 'knitsail' in html and 'var challenge_version=' in html:
            readable = '; '.join(cookie.name + '=' + cookie.value for cookie in jar if not http_only(cookie))
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
            if computed.get('errors') or computed.get('engine', {}).get('fatal_reason') or computed.get('fetchRequestsNotExecuted'):
                raise DriverError('BOOTSTRAP_INCOMPLETE')
            target = computed.get('navigationUrl')
            if not target:
                raise DriverError('BOOTSTRAP_NO_NAVIGATION')
            checked_url(target, url)
            for write in computed.get('cookieWrites', []):
                apply_bootstrap_cookie(jar, write)
            result = request(session, target, deadline)
            metrics.update({'bootstrapExecuted': True, 'bootstrapMs': computed['elapsedMs'], 'runtime': computed['runtime']})
        metrics['totalMs'] = round((time.monotonic() - started) * 1000)
        result['metrics'] = metrics
        return classified(result)
    finally:
        if cookies is not None and cookies is not session.cookies.jar:
            cookies.clear()
            for cookie in session.cookies.jar:
                cookies.set_cookie(cookie)
        session.close()


def terminate(signum, frame):
    raise KeyboardInterrupt('Search cancelled')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, terminate)
    jar = None
    exit_code = 0
    try:
        if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != '--session'):
            raise ValueError('Expected Search URL and bootstrap executable')
        if len(sys.argv) == 4:
            payload = sys.stdin.read(65537)
            if len(payload) > 65536:
                raise ValueError('Anonymous session exceeds limit')
            jar = restore_cookies(json.loads(payload))
        result = fetch(sys.argv[1], sys.argv[2], jar)
    except Exception as error:
        code = error.code if isinstance(error, DriverError) else 'RUNTIME_TIMEOUT' if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)) or getattr(error, 'code', None) == 28 else 'INVALID_RESPONSE' if isinstance(error, (ValueError, json.JSONDecodeError)) else 'NETWORK_ERROR'
        result = {'error': {'type': type(error).__name__, 'code': code}}
        exit_code = 1
    if jar is not None:
        try:
            result['sessionCookies'] = export_cookies(jar)
        except ValueError:
            result = {'error': {'code': 'INVALID_RESPONSE'}}
            exit_code = 1
    print(json.dumps(result))
    sys.exit(exit_code)
