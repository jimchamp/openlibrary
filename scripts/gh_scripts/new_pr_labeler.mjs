import { Octokit } from "@octokit/action";

console.log('Script starting....')
const octokit = new Octokit()
await main()
console.log('Script terminated....')

async function main() {
    const {fullRepoName, prAuthor, prNumber, prBody} = parseArgs()

    console.log(`fullRepoName: ${fullRepoName}`)
    console.log(`prAuthor: ${prAuthor}`)
    console.log(`prNumber: ${prNumber}`)
    console.log(`prBody: ${prBody}`)
    // Look for "Closes:" statement, storing the issue number (if present)
    const issueNumber = findLinkedIssue(prBody)

    if (!issueNumber) {
        console.log('No linked issue found for this pull request.')
        return
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
    const assignLead = leadName && !(leadName === prAuthor)

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

/**
 * Returns an object containing the parsed command-line arguments.
 * 
 * Any newline characters in the PR's body are replaced by space characters.
 *
 * @returns {Record<string, string>}
 */
function parseArgs() {
    if (process.argv.length < 6) {
        console.log('Unexpected number of arguments.')
        process.exit(1)
    }
    const prBody = process.argv.slice(5).join(' ')
    return {
        fullRepoName: process.argv[2],
        prAuthor: process.argv[3],
        prNumber: process.argv[4],
        prBody: prBody
    }
}

/**
 * Finds first "Closes" statement in the given pull request body, then
 * returns the number of the linked issue or an empty string, if none exists.
 *
 * @param {string} body The body of a GitHub pull request
 * @returns {string} The number of the linked issue that will be closed 
 *                   by this pull request, or an empty string if no 
 *                   "Closes" statement is found.
 */
function findLinkedIssue(body) {
    let lowerBody = body.toLowerCase()
    const matches = lowerBody.match(/closes #(\d+)/)
    return matches.length ? Number(matches[1]) : ''
}
