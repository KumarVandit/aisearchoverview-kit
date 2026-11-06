import http.cookiejar
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

from curl_cffi.requests.cookies import Cookies

spec = importlib.util.spec_from_file_location('embedded_fetch', Path(__file__).with_name('fetch.py'))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
URL = 'https://www.google.com/search?q=example&hl=en&gl=us'


class Session:
    def __init__(self, *args, **kwargs):
        self.cookies = Cookies()
        self.cookies.jar.set_cookie(http.cookiejar.Cookie(0, 'visible', 'own-value', None, False, 'www.google.com', False, False, '/', True, True, None, True, None, None, {}, False))
        self.cookies.set('secret', 'http-only', domain='www.google.com')
        self.calls = []
        self.closed = False
        self.responses = [(200, 'knitsail var challenge_version=0;'), (200, 'actual-result')]

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        status, body = (200, 'anonymous homepage') if url == 'https://www.google.com/' else self.responses.pop(0)
        return types.SimpleNamespace(status_code=status, url=url, headers={'Content-Type': 'text/html'}, content=body.encode())

    def close(self):
        self.closed = True


class Process:
    def __init__(self, result):
        self.result = result
        self.returncode = 0
        self.payload = None
        self.killed = False

    def communicate(self, payload, timeout):
        self.payload = json.loads(payload)
        return json.dumps(self.result), ''

    def poll(self):
        return self.returncode

    def kill(self):
        self.killed = True

    def wait(self):
        return 0


class FetchTests(unittest.TestCase):
    def execute(self, session, process):
        with patch.object(driver.requests, 'Session', return_value=session), patch.object(driver.subprocess, 'Popen', return_value=process):
            return driver.fetch(URL, sys.executable)

    def computed(self, **changes):
        return {'navigationUrl': URL + '&sei=own-transition', 'cookieWrites': ['SG_SS=raw+cookie/value==; path=/'], 'errors': [], 'engine': {'fatal_reason': None}, 'fetchRequestsNotExecuted': 0, 'elapsedMs': 2, 'runtime': 'test runtime', **changes}

    def test_bootstrap_uses_own_readable_cookies_and_preserves_raw_cookie_without_explicit_cookie_header(self):
        session = Session()
        process = Process(self.computed())
        result = self.execute(session, process)
        self.assertEqual(result['body'], 'actual-result')
        self.assertEqual(process.payload['initialCookies'], 'visible=own-value')
        self.assertEqual(session.cookies.get('SG_SS'), 'raw+cookie/value==')
        self.assertEqual(len(session.calls), 3)
        self.assertTrue(all(call[1]['allow_redirects'] is False for call in session.calls))
        self.assertTrue(all('headers' not in call[1] for call in session.calls))
        self.assertTrue(session.closed)

    def test_homepage_gate_stops_before_search_or_execution(self):
        session = Session()
        session.get = lambda url, **kwargs: types.SimpleNamespace(status_code=302, url=url, headers={}, content=b'blocked')
        with patch.object(driver.requests, 'Session', return_value=session), patch.object(driver.subprocess, 'Popen') as execute:
            result = driver.fetch(URL, sys.executable)
            self.assertEqual(result['access']['kind'], 'redirect')
            execute.assert_not_called()
        self.assertTrue(session.closed)

    def test_challenge_redirects_stop_before_search_and_never_export_redirect_tokens(self):
        session = Session()
        session.get = lambda url, **kwargs: types.SimpleNamespace(status_code=302, url=url, headers={'Location': 'https://www.google.com/sorry/index?continue=private-token'}, content=b'')
        with patch.object(driver.requests, 'Session', return_value=session), patch.object(driver.subprocess, 'Popen') as execute:
            result = driver.fetch(URL, sys.executable)
            self.assertEqual(result['access'], {'kind': 'blocked', 'status': 302})
            self.assertNotIn('private-token', json.dumps(result))
            execute.assert_not_called()
        self.assertTrue(session.closed)

    def test_regional_and_unrecognized_redirects_are_not_reported_as_denials(self):
        for target, expected in [('https://www.google.com.hk/url?url=private-token', 'regional-redirect'), ('https://example.com/sorry/index', 'redirect'), ('https://www.google.com.evil.example/sorry/index', 'redirect')]:
            response = {'status': 302, 'url': URL, 'headers': {'Location': target}, 'body': ''}
            result = driver.classified(response)
            self.assertEqual(result['access']['kind'], expected)
            self.assertNotIn('Location', result['headers'])

    def test_redirect_and_plain_results_are_not_retried_or_executed(self):
        for status in [200, 302, 429]:
            session = Session()
            session.responses = [(status, 'ordinary response')]
            with patch.object(driver.requests, 'Session', return_value=session), patch.object(driver.subprocess, 'Popen') as execute:
                result = driver.fetch(URL, sys.executable)
                self.assertEqual(result['status'], status)
                execute.assert_not_called()
            self.assertEqual(len(session.calls), 2)

    def test_foreign_or_mutated_navigation_stops_before_second_request(self):
        for target in ['https://example.com/search?q=example', 'https://www.google.com/sorry/index', URL.replace('example', 'different'), URL + '&unexpected=value']:
            session = Session()
            with self.assertRaises(ValueError):
                self.execute(session, Process(self.computed(navigationUrl=target)))
            self.assertEqual(len(session.calls), 2)
            self.assertTrue(session.closed)

    def test_execution_errors_and_pending_requests_do_not_get_replayed(self):
        for changes in [{'errors': ['failed']}, {'engine': {'fatal_reason': 'budget'}}, {'fetchRequestsNotExecuted': 1}]:
            session = Session()
            with self.assertRaises(RuntimeError):
                self.execute(session, Process(self.computed(**changes)))
            self.assertEqual(len(session.calls), 2)

    def test_timed_out_child_is_killed_and_session_closed(self):
        session = Session()
        process = Process(self.computed())
        process.returncode = None
        process.communicate = lambda *args, **kwargs: (_ for _ in ()).throw(subprocess.TimeoutExpired('test-child', 1))
        with self.assertRaises(subprocess.TimeoutExpired):
            self.execute(session, process)
        self.assertTrue(process.killed)
        self.assertTrue(session.closed)
        self.assertEqual(len(session.calls), 2)

    def test_ai_mode_redirect_cannot_downgrade_to_ordinary_search(self):
        mode = URL + '&udm=50'
        with self.assertRaises(ValueError):
            driver.checked_url(URL, mode)
        self.assertEqual(driver.checked_url(mode + '&sei=own-transition', mode), mode + '&sei=own-transition')

    def test_foreign_origins_and_cookie_injection_are_rejected(self):
        for value in ['http://www.google.com/search', 'https://user:password@www.google.com/search', 'https://www.google.com:444/search', 'https://www.google.com/search#fragment']:
            with self.assertRaises(ValueError):
                driver.checked_url(value)
        session = Session()
        with self.assertRaises(ValueError):
            self.execute(session, Process(self.computed(cookieWrites=['NID=unexpected'])))
        self.assertEqual(len(session.calls), 2)


if __name__ == '__main__':
    unittest.main()
