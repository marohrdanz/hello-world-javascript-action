const github = require('@actions/github');
const https = require('https');
const fs = require('fs')
const zlib = require('zlib');
env = process.env;

function fail(message, exitCode=1) {
    console.log(`::error::${message}`);
    process.exit(exitCode);
}

function request(method, path, data, callback) {
    try {
        if (data) {
            data = JSON.stringify(data);
        }  
        const options = {
            hostname: 'api.github.com',
            port: 443,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data ? data.length : 0,
                'Accept-Encoding' : 'gzip',
                'Authorization' : `token ${env.INPUT_TOKEN}`,
                'User-Agent' : 'GitHub Action - development'
            }
        }
        const req = https.request(options, res => {
            let chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                let buffer = Buffer.concat(chunks);
                if (res.headers['content-encoding'] === 'gzip') {
                    zlib.gunzip(buffer, (err, decoded) => {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, res.statusCode, decoded && JSON.parse(decoded));
                        }
                    });
                } else {
                    callback(null, res.statusCode, buffer.length > 0 ? JSON.parse(buffer) : null);
                }
            });
            req.on('error', err => callback(err));
        });
        if (data) {
            req.write(data);
        }
        req.end();
    } catch(err) {
        callback(err);
    }
}

function main() {
    const prefix = env.INPUT_PREFIX ? `${env.INPUT_PREFIX}-` : '';

    for (let varName of ['GITHUB_REPOSITORY', 'GITHUB_SHA']) {
        if (!env[varName]) {
            fail(`ERROR: Environment variable ${varName} is not defined.`);
        }
    }

    console.log(`Checking repo: ${env.GITHUB_REPOSITORY}`);
    console.log(`Checking SHA: ${env.GITHUB_SHA}`);


    request('GET', `/repos/${env.GITHUB_REPOSITORY}/git/refs/tags/${prefix}`, null, (err, status, result) => {
       if (status === 404) {
            console.log('No build-number ref available, starting at 1.');
            nextBuildNumber = 1;
            nrTags = [];
       } else if (status === 200) {
            const regexString = `/${prefix}(\\d+)$`;
            console.log(`prefix: ${prefix}`);
            console.log('regexString: ', regexString);
            const regex = new RegExp(regexString);
            nrTags = result.filter(d => d.ref.match(regex));
            const MAX_OLD_NUMBERS = 5; //One or two ref deletes might fail, but if we have lots then there's something wrong!
            if (nrTags.length > MAX_OLD_NUMBERS) {
                fail(`ERROR: Too many ${prefix} refs in repository, found ${nrTags.length}, expected only 1. Check your tags!`);
            }
            //Existing build numbers:
            console.log("nrTags:")
            console.log(nrTags)
            let nrs = nrTags.map(t => parseInt(t.ref.match(/-(\d+)$/)[1]));
            let currentBuildNumber = Math.max(...nrs);
            console.log(`Last build number was ${currentBuildNumber}.`);
            nextBuildNumber = currentBuildNumber + 1;
            console.log(`Updating build counter to ${nextBuildNumber}...`);
        } else {
            if (err) {
                fail(`Failed to get refs. Error: ${err}, status: ${status}`);
            } else {
                fail(`Getting build-number refs failed with http status ${status}, error: ${JSON.stringify(result)}`);
            } 
       }
       let newRefData = {
            ref:`refs/tags/${prefix}${nextBuildNumber}`, 
            sha: env.GITHUB_SHA
        };

        request('POST', `/repos/${env.GITHUB_REPOSITORY}/git/refs`, newRefData, (err, status, result) => {
            if (status !== 201 || err) {
                fail(`Failed to create new build-number ref. Status: ${status}, err: ${err}, result: ${JSON.stringify(result)}`);
            }

            console.log(`Successfully updated build number to ${nextBuildNumber}`);
            //Setting the output and a environment variable to new build number...
            fs.writeFileSync(process.env.GITHUB_OUTPUT, `build_number=${nextBuildNumber}`);
            fs.writeFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${nextBuildNumber}`);
            //Save to file so it can be used for next jobs...
            //fs.writeFileSync('BUILD_NUMBER', nextBuildNumber.toString());
         });
    });

}

main();


