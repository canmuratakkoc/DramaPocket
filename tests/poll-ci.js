/**
 * Helper to poll GitHub Actions workflow run for DramaPocket
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'DramaPocket-QA-Release',
                'Accept': 'application/vnd.github.v3+json'
            }
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON (${res.statusCode}): ${data.slice(0, 300)}`));
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Checking GitHub Actions runs for canmuratakkoc/DramaPocket ...');
    const runsData = await fetchJson('https://api.github.com/repos/canmuratakkoc/DramaPocket/actions/runs');
    if (!runsData || !runsData.workflow_runs) {
        console.error('No workflow_runs returned:', runsData);
        process.exit(1);
    }

    console.log(`Total workflow runs: ${runsData.total_count}`);
    const latestRuns = runsData.workflow_runs.slice(0, 5);
    for (const r of latestRuns) {
        console.log(`- ID: ${r.id} | SHA: ${r.head_sha.slice(0, 7)} | Status: ${r.status} | Conclusion: ${r.conclusion} | Event: ${r.event} | Name: "${r.name}" | URL: ${r.html_url}`);
    }

    const latest = latestRuns[0];
    return latest;
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

module.exports = { fetchJson, main };
