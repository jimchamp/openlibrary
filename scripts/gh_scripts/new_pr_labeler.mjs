import { Octokit } from "@octokit/action";

console.log('Script starting....')
await main(new Octokit())
console.log('Script terminated....')

async function main(octokit) {
    const [fullRepoName, author, prNumber, body] = parseArgs()

    // Look for "Closes:" statement, storing the issue number (if present)
    const issueNumber = findLinkedIssue(body)

    if (!issueNumber) {
        console.log('No linked issue found for this pull request.')
        process.exit(1)
    }

    // Fetch the issue
    const [repoOwner, repoName] = fullRepoName.split('/')
    const linkedIssue = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
        owner: repoOwner,
        repo: repoName,
        issue_number: issueNumber,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
    if (!linkedIssue) {
        console.log(`An issue occurred while fetching issue #${issueNumber}`)
        process.exit(1)
    }

    // Find issue's assignee, if any
    // const assignee = linkedIssue.assignee
    // const assigneeUserName = assignee?.login

    // Check the issue's labels for the priority and lead
    let leadName
    let priority
    for (const label of linkedIssue.labels) {
        if (!leadName && label.name.startsWith('Lead: @')) {
            leadName = label.name.split('@')[1]
        }
        if (!priority && label.name.match(/Priority: \d/)) {
            priority = label.name
        }
    }

    // Don't assign lead to PR if PR author is the issue lead
    const assignLead = leadName && !(leadName === author)

    // Update PR, adding assignee and priority label
    if (assignLead) {
        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
            owner: repoOwner,
            repo: repoName,
            issue_number: prNumber,
            assignees: [leadName],
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          })
    }

    if (priority) {
        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
            owner: repoOwner,
            repo: repoName,
            issue_number: prNumber,
            labels: [priority],
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          })
    }
}

function parseArgs() {
    if (process.argv.length !== 6) {
        console.log('Unexpected number of arguments.')
        process.exit(1)
    }
    return [process.argv[2], process.argv[3], process.argv[4], process.argv[5]]
}

/**
 * Finds first "Closes" statement in the given pull request body, then
 * returns the number of the linked issue or `null`, if none exists.
 *
 * @param {string} body The body of a GitHub pull request
 * @returns {number|null} The number of the linked issue that will be closed 
 *                        by this pull request, or `null` if no "Closes" statement
 *                        is found.
 */
function findLinkedIssue(body) {
    let lowerBody = body.toLowerCase()
    let closesIndex = lowerBody.search(/closes #\d+/)
    if (closesIndex === -1) {
        return null
    }
    let issueNumberString = lowerBody[closesIndex + 8]
    for (let i = closesIndex + 9; lowerBody[i].match(/\d/); ++i) {
        issueNumberString += lowerBody[i]
    }
    return Number(issueNumberString)
}
