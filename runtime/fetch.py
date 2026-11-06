import json
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.parse

from curl_cffi import requests, CurlHttpVersion

MAX_BYTES = 4 * 1024 * 1024
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
    response = session.get(url, timeout=remaining, allow_redirects=False)
    if len(response.content) > MAX_BYTES:
        raise ValueError('Search response exceeds size limit')
    return {
        'status': response.status_code,
        'url': response.url,
        'headers': {key: response.headers[key] for key in ['Content-Type', 'Retry-After', 'Location'] if key in response.headers},
        'body': response.content.decode('utf-8', errors='replace'),
    }


def fetch(url, executable):
    checked_url(url)
    executable = str(Path(executable).resolve(strict=True))
    started = time.monotonic()
    deadline = started + 19
    session = requests.Session(trust_env=False, http_version=CurlHttpVersion.V1_1, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close',
    })
    try:
        jar = session.cookies.jar
        homepage = request(session, 'https://www.google.com/', deadline)
        if access_state(homepage):
            return classified(homepage)
        if homepage['status'] != 200:
            raise DriverError('HOMEPAGE_UNAVAILABLE')
        first = request(session, url, deadline)
        if access_state(first):
            return classified(first)
        result = first
        metrics = {'homepageStatus': homepage['status'], 'initialStatus': first['status'], 'bootstrapExecuted': False}
        html = first['body']
        if first['status'] == 200 and 'knitsail' in html and 'var challenge_version=' in html:
            readable = '; '.join(cookie.name + '=' + cookie.value for cookie in jar if not cookie.has_nonstandard_attr('HttpOnly') and not cookie.has_nonstandard_attr('httponly'))
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
                pair = write.split(';', 1)[0]
                name, value = pair.split('=', 1)
                if name != 'SG_SS' or any(character in value for character in '\r\n;'):
                    raise ValueError('Unexpected bootstrap cookie')
                session.cookies.set(name, value, domain='www.google.com', path='/')
            result = request(session, target, deadline)
            metrics.update({'bootstrapExecuted': True, 'bootstrapMs': computed['elapsedMs'], 'runtime': computed['runtime']})
        metrics['totalMs'] = round((time.monotonic() - started) * 1000)
        result['metrics'] = metrics
        return classified(result)
    finally:
        session.close()


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
