import http.cookiejar
import importlib.util
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('session_fetch', Path(__file__).with_name('session-fetch.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class SessionCookieTests(unittest.TestCase):
    def test_max_age_is_persisted_and_expired_cookie_is_removed(self):
        jar = http.cookiejar.LWPCookieJar()
        before = int(time.time())
        runtime.apply_bootstrap_cookie(jar, 'SG_SS=synthetic; Max-Age=600; Path=/; Secure')
        cookie = list(jar)[0]
        self.assertGreaterEqual(cookie.expires, before+600)
        self.assertLessEqual(cookie.expires, int(time.time())+600)
        self.assertFalse(cookie.discard)
        self.assertTrue(cookie.secure)
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory)/'own.cookies')
            jar.save(path, ignore_discard=True, ignore_expires=False)
            restored = http.cookiejar.LWPCookieJar(path)
            restored.load(ignore_discard=True, ignore_expires=False)
            self.assertEqual(len(restored),1)
            self.assertEqual(list(restored)[0].expires,cookie.expires)
        runtime.apply_bootstrap_cookie(jar,'SG_SS=removed; Max-Age=0; Path=/')
        self.assertEqual(len(jar),0)

    def test_expires_is_honored_and_session_cookie_remains_session_scoped(self):
        jar = http.cookiejar.CookieJar()
        runtime.apply_bootstrap_cookie(jar,'SG_SS=synthetic; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/')
        self.assertEqual(list(jar)[0].expires,1924992000)
        runtime.apply_bootstrap_cookie(jar,'SG_SS=synthetic; Path=/')
        self.assertIsNone(list(jar)[0].expires)
        self.assertTrue(list(jar)[0].discard)

    def test_foreign_scope_and_inaccessible_or_malformed_writes_are_rejected(self):
        for write in ['OTHER=value','SG_SS=value; Domain=evil.test','SG_SS=value; HttpOnly','SG_SS=value; Max-Age=invalid','SG_SS=value\r\nextra=value','SG_SS=value; Path=/maps']:
            with self.subTest(write=write):
                with self.assertRaises(ValueError):
                    runtime.apply_bootstrap_cookie(http.cookiejar.CookieJar(),write)

if __name__ == '__main__':
    unittest.main()
