const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');
const fs = require('fs')
env = process.env;

try {
  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}

function fail(message, exitCode=1) {
    console.log(`::error::${message}`);
    process.exit(exitCode);
}

function main() {

    const path = 'BUILD_NUMBER/BUILD_NUMBER';
    const prefix = env.INPUT_PREFIX ? `${env.INPUT_PREFIX}-` : '';

    //See if we've already generated the build number and are in later steps...
    if (fs.existsSync(path)) {
        let buildNumber = fs.readFileSync(path);
        console.log(`Build number already generated in earlier jobs, using build number ${buildNumber}...`);
        //Setting the output and a environment variable to new build number...
        fs.writeFileSync(process.env.GITHUB_OUTPUT, `build_number=${buildNumber}`);
        fs.writeFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${buildNumber}`);
        return;
    } else {
        console.log("In the else block");
    }

    //Some sanity checking:
    for (let varName of ['INPUT_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA']) {
        console.log("chacking varName: ${varName}");
        if (!env[varName]) {
            fail(`ERROR: Environment variable ${varName} is not defined.`);
        }
    }
}

main();


