use serde::{Deserialize, Serialize};

const GITHUB_REPO: &str = "daigotanaka0714/image-crunch";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Information about an available update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// Whether an update is available
    pub update_available: bool,
    /// Current version of the app
    pub current_version: String,
    /// Latest version available
    pub latest_version: String,
    /// URL to the release page
    pub release_url: String,
    /// Release notes (body of the release)
    pub release_notes: Option<String>,
}

/// GitHub release response (partial)
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}

/// Check for updates from GitHub releases
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "Image-Crunch-App")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        // No releases yet
        return Ok(UpdateInfo {
            update_available: false,
            current_version: CURRENT_VERSION.to_string(),
            latest_version: CURRENT_VERSION.to_string(),
            release_url: format!("https://github.com/{}/releases", GITHUB_REPO),
            release_notes: None,
        });
    }

    if !response.status().is_success() {
        return Err(format!("GitHub API returned status: {}", response.status()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    // Remove 'v' prefix if present for comparison
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let current = CURRENT_VERSION.trim_start_matches('v');

    let update_available = is_newer_version(&latest_version, current);

    Ok(UpdateInfo {
        update_available,
        current_version: CURRENT_VERSION.to_string(),
        latest_version,
        release_url: release.html_url,
        release_notes: release.body,
    })
}

/// Get the current app version
#[tauri::command]
pub fn get_current_version() -> String {
    CURRENT_VERSION.to_string()
}

/// Compare semantic versions to check if `latest` is newer than `current`
fn is_newer_version(latest: &str, current: &str) -> bool {
    let parse_version =
        |v: &str| -> Vec<u32> { v.split('.').filter_map(|s| s.parse::<u32>().ok()).collect() };

    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);

    for i in 0..latest_parts.len().max(current_parts.len()) {
        let latest_part = latest_parts.get(i).copied().unwrap_or(0);
        let current_part = current_parts.get(i).copied().unwrap_or(0);

        if latest_part > current_part {
            return true;
        } else if latest_part < current_part {
            return false;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_comparison() {
        assert!(is_newer_version("0.2.0", "0.1.0"));
        assert!(is_newer_version("1.0.0", "0.9.9"));
        assert!(is_newer_version("0.1.1", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.2.0"));
        assert!(!is_newer_version("0.0.9", "0.1.0"));
    }
}
