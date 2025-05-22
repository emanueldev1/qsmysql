/**
 * Module to monitor version updates for a resource by querying GitHub API.
 * @module versionMonitor
 */

const CONFIG = {
    API_URL: "https://api.github.com/repos/emanueldev1/qs_lib/releases/latest",
    VERSION_CHECK_KEY: 'mysql_versioncheck',
    DEFAULT_CHECK_VALUE: 1,
    DELAY_MS: 1000,
    VERSION_PATTERN: /^v?(\d+)\.(\d+)\.(\d+)$/, // Updated to optionally match 'v' prefix
};

/**
 * Extracts version numbers from a version string.
 * @param {string} versionString - Version string in format "x.y.z" or "vx.y.z".
 * @returns {number[]|null} Array of version numbers or null if invalid.
 */
const parseVersion = (versionString) =>
    versionString?.match(CONFIG.VERSION_PATTERN)?.slice(1).map(Number) ?? null;

/**
 * Compares two version arrays and logs if an update is needed.
 * @param {number[]} current - Current version numbers [major, minor, patch].
 * @param {number[]} latest - Latest version numbers [major, minor, patch].
 * @param {string} resource - Resource name.
 * @param {string} releaseUrl - URL of the latest release.
 */
const evaluateVersions = (current, latest, resource, releaseUrl) => {
    const isUpdateRequired = latest.some((num, idx) => {
        if (num !== current[idx]) return num > current[idx];
        return false;
    });

    if (isUpdateRequired) {
        console.log(
            `\x1b[33mUpdate available for ${resource}: v${current.join('.')} → v${latest.join('.')}\n${releaseUrl}\x1b[0m`
        );
    }
};

/**
 * Fetches and processes the latest release data from GitHub.
 * @param {string} resource - Resource name.
 * @param {number[]} currentVersion - Current version numbers.
 * @returns {Promise<void>}
 */
const processReleaseData = async (resource, currentVersion) => {
    try {
        const response = await fetch(CONFIG.API_URL, {
            headers: { Accept: 'application/vnd.github+json' },
        });

        if (!response.ok) return;

        const { tag_name: tag, html_url: releaseUrl, prerelease } = await response.json();
        if (prerelease) return;

        const latestVersion = parseVersion(tag);
        if (!latestVersion || latestVersion.join('.') === currentVersion.join('.')) return;

        evaluateVersions(currentVersion, latestVersion, resource, releaseUrl);
    } catch (error) {
        console.warn(`Error fetching latest version for ${resource}: ${error.message}`);
    }
};

/**
 * Main function to initiate version monitoring.
 * @returns {Promise<void>}
 */
const monitorVersion = async () => {
    if (GetConvarInt(CONFIG.VERSION_CHECK_KEY, CONFIG.DEFAULT_CHECK_VALUE) === 0) return;

    const resource = GetCurrentResourceName();
    const currentVersion = parseVersion(GetResourceMetadata(resource, 'version', 0));
    if (!currentVersion) return;

    setTimeout(() => processReleaseData(resource, currentVersion), CONFIG.DELAY_MS);
};

// Execute monitoring
monitorVersion().catch((err) =>
    console.error(`Version monitor initialization failed: ${err.message}`)
);