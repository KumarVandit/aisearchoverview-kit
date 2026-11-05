use mg_butane::modern::ResourceProfile;
use mg_sparkle::js_browser::{Request, boa::BoaPageRealm};
use mg_sparkle::page_session::{
    SessionReply, TaskPump, observer::ObserverInit, platform::PlatformInit,
};
use serde::Deserialize;
use serde_json::json;
use std::io::{self, Read};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    url: String,
    html: String,
    #[serde(default)]
    initial_cookies: String,
    crypto_seed: [u8; 32],
}

fn collect(
    reply: &SessionReply,
    cookies: &mut Vec<String>,
    errors: &mut Vec<String>,
    requests: &mut usize,
) {
    cookies.extend(reply.cookie_writes.iter().cloned());
    errors.extend(reply.errors.iter().cloned());
    *requests += reply.fetch_requests.len();
}

fn validate_input(input: &Input) -> Result<(), Box<dyn std::error::Error>> {
    let url = url::Url::parse(&input.url)?;
    if url.origin().ascii_serialization() != "https://www.google.com"
        || url.path() != "/search"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Expected HTTPS Google Search origin".into());
    }
    if input.html.len() > 1024 * 1024
        || !input.html.contains("var g='knitsail'")
        || !input.html.contains("var challenge_version=")
        || !input.html.contains("(0,eval)")
    {
        return Err("Unknown or oversized bootstrap HTML".into());
    }
    Ok(())
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin()
        .take(2 * 1024 * 1024)
        .read_to_string(&mut input)?;
    let input: Input = serde_json::from_str(&input)?;
    validate_input(&input)?;
    let started = Instant::now();
    let request = Request {
        url: input.url,
        html: input.html,
        external_scripts: None,
    };
    let platform = PlatformInit {
        initial_cookies: input.initial_cookies,
        time_origin_ms: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs_f64() * 1000.0,
        ..PlatformInit::default()
    };
    let (mut realm, mut reply) = BoaPageRealm::start_with_platform_and_profile(
        request,
        ObserverInit::Disabled,
        platform,
        input.crypto_seed,
        ResourceProfile::InteractivePageV1,
    );
    let mut cookies = Vec::new();
    let mut errors = Vec::new();
    let mut requests = 0;
    let mut pumps = 0;
    collect(&reply, &mut cookies, &mut errors, &mut requests);
    while reply.navigation.is_none() && started.elapsed() < Duration::from_secs(15) && pumps < 64 {
        let Some(wake) = reply.task_wake.clone() else {
            break;
        };
        let Some(realm) = realm.as_mut() else {
            break;
        };
        let delay = Duration::from_millis(u64::from(wake.delay_ms) + 1);
        if delay > Duration::from_secs(15).saturating_sub(started.elapsed()) {
            break;
        }
        std::thread::sleep(delay);
        reply = realm.pump_tasks(TaskPump {
            wake_token: wake.token,
        });
        collect(&reply, &mut cookies, &mut errors, &mut requests);
        pumps += 1;
    }
    println!(
        "{}",
        json!({
            "navigationUrl": reply.navigation,
            "cookieWrites": cookies,
            "errors": errors,
            "fetchRequestsNotExecuted": requests,
            "state": reply.state,
            "scriptsExecuted": reply.scripts_executed,
            "pumps": pumps,
            "elapsedMs": started.elapsed().as_millis(),
            "engine": reply.boa,
            "userAgent": mg_sparkle::USER_AGENT,
            "runtime": "embedded mg-sparkle/Boa DOM library; no desktop or HTTP broker"
        })
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHELL: &str = "var g='knitsail';var challenge_version=0;(0,eval)";

    fn input(url: &str, html: &str) -> Input {
        Input {
            url: url.into(),
            html: html.into(),
            initial_cookies: String::new(),
            crypto_seed: [1; 32],
        }
    }

    #[test]
    fn recognized_search_input_is_admitted_without_execution() {
        assert!(
            validate_input(&input(
                "https://www.google.com/search?q=sky&hl=en&gl=us",
                SHELL
            ))
            .is_ok()
        );
    }

    #[test]
    fn other_origins_credentials_and_routes_are_rejected() {
        for url in [
            "http://www.google.com/search?q=sky",
            "https://www.google.com.example/search",
            "https://www.google.com@evil.example/search",
            "https://user@www.google.com/search",
            "https://www.google.com/async/folif",
        ] {
            assert!(validate_input(&input(url, SHELL)).is_err(), "{url}");
        }
    }

    #[test]
    fn unknown_and_oversized_html_are_rejected() {
        assert!(
            validate_input(&input(
                "https://www.google.com/search?q=sky",
                "<html>other page</html>"
            ))
            .is_err()
        );
        let oversized = format!("{SHELL}{}", " ".repeat(1024 * 1024));
        assert!(validate_input(&input("https://www.google.com/search?q=sky", &oversized)).is_err());
    }

    #[test]
    fn unexpected_process_options_are_rejected() {
        let json = serde_json::json!({"url":"https://www.google.com/search?q=sky", "html":SHELL, "cryptoSeed":vec![1;32], "proxy":"https://example.test"});
        assert!(serde_json::from_value::<Input>(json).is_err());
    }
}

fn main() {
    // The observed bootstrap overflows the default macOS main-thread stack in debug builds.
    let worker = std::thread::Builder::new()
        .name("embedded-bootstrap".into())
        .stack_size(32 * 1024 * 1024)
        .spawn(|| run().map_err(|error| error.to_string()))
        .expect("Cannot start computation thread");
    match worker.join() {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
        Err(_) => {
            eprintln!("Computation thread panicked");
            std::process::exit(1);
        }
    }
}
