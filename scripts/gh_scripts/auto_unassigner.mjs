/**
 * Runs the auto-unassigner script.
 *
 * Optional parameters:
 * --daysSince : Number : Issues that have had the same assignee for at least this many days are candidates for unassignment
 * --repoOwner : String : Pass to run on a specific OpenLibrary fork
 */
import {Octokit} from "@octokit/action";

console.log('starting...')

const DEFAULT_OPTIONS = {
    daysSince: 14,
    repoOwner: 'internetarchive'
}

const passedArguments = parseArgs()

/**
 * Parses any arguments that were passed when this script was executed, and returns
 * an object containing the arguments.
 *
 * Exits the script if an odd number of arguments are provided.  The script takes only
 * options as arguments, and we expect a space between the option flag and value:
 * `--flag value_of_flag`
 *
 * @returns {Record}
 */
function parseArgs() {
    const result = {}
    // XXX : Does this check make sense?
    if (process.argv.length % 2 !== 0) {
        console.log('Unexpected number of arguments')
        process.exit(1)
    }
    if (process.argv.length > 2) {
        for (let i = 2, j = 3; i < process.argv.length; i+=2, j+=2) {
            let arg = process.argv[i]
            // Remove leading `-` characters
            while (arg.charAt(0) === '-') {
                arg = arg.substring(1)
            }
            result[arg] = process.argv[j]
        }
    }

    return result
}

// Octokit is authenticated with the `GITHUB_TOKEN` that is added to the
// environment in the `auto_unassigner` workflow
const octokit = new Octokit();

/**
 * List of GitHub usernames who, if assigned to an issue, should not be unassigned.
 * @type {String[]}
 * @see {excludeAssigneesFilter}
 */
const excludeAssignees = []

/**
 * List of GitHub labels that, if on an issue, excludes the issue from automation.
 * @type {String[]}
 */
const excludeLabels = ['no-automation']

/**
 * Functions used to filter out issues that should have their assignees removed.
 *
 * Each function in this array should take an array of records as a parameter, and
 * return a promise that resolves to an array of records.
 *
 * Functions will be called in order, and pass along their results to the next filter.
 * If possible, long-running or otherwise expensive calls should be added to the end
 * of this array.
 * @type {CallableFunction[]}
 * @see {filterIssues}
 */
const filters = [
    excludePullRequestsFilter,
    excludeLabelsFilter,
    excludeAssigneesFilter,
    recentAssigneeFilter,
    linkedPullRequestFilter
]

/**
 * Multiple filters will require data from the GitHub Timeline API before a decision
 * about an issue can be made. In order to avoid redundant API calls, timeline results
 * will be stored here. Issue number is used as the key.
 * @type {Record<Number, Record[]>}
 */
const issueTimelines = {}

const mainOptions = Object.assign({}, DEFAULT_OPTIONS, passedArguments)
// `daysSince` will be a string if passed in from the command line
mainOptions.daysSince = Number(mainOptions.daysSince)

await main()

/**
 * Runs the auto-unassigner job.
 *
 * @returns {Promise<void>}
 */
async function main() {  // XXX : Inject octokit for easier testing
    console.log('entered main()')

    await fetchIssues()
        .then(issues => filterIssues(issues))
    /*
    console.log('\nissues:')
    console.log(issues)
    console.log(`length: ${issues.length}`)

    if (issues.length === 0) {
        console.log('No issues were returned by the initial query')
        return
    }

    const actionableIssues = await filterIssues(issues, filters)
    console.log('\nactionableIssues:')
    console.log(`length: ${actionableIssues.length}`)
    console.log('assignees:')
    for (const issue of actionableIssues) {
        console.log(issue.assignees)
        console.log('\n')
    }
    console.log('exiting main()')
    */
}

// START: API Calls
/**
 * Returns all GitHub issues that are open and one or more assignees.
 *
 * __Important:__ GitHub's REST API considers every pull request to be an
 * issue.  Pull requests may be included in the results returned by this
 * function, and can be identified by the presence of a `pull_request` key.
 *
 * @returns {Promise<Array<Record>>}
 * @see  [GitHub REST documentation]{@link https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues}
 */
async function fetchIssues() {
    console.log('entered fetchIssues()')
    const result = await octokit.paginate('GET /repos/{owner}/{repo}/issues', {
            owner: mainOptions.repoOwner,
            repo: 'openlibrary',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            },
            assignee: '*',
            state: 'open',
            per_page: 100
        })

    console.log('exiting fetchIssues()')
    return result
}

/**
 * Returns the timeline of the given issue.
 *
 * Attempts to get the timeline from the `issueTimelines` store. If no
 * timeline is found, calls GitHub's Timeline API and stores the result
 * before returning.
 *
 * @param issue {Record}
 * @returns {Promise<Array<Record>>}
 * @see {issueTimelines}
 */
async function getTimeline(issue) {
    console.log('entered getTimeline()')

    const issueNumber = issue.number
    if (issueTimelines[issueNumber]) {
        console.log('  found cached timeline')
        console.log('exiting getTimeline()')
        return issueTimelines[issueNumber]
    }
    // Fetching timeline:
    console.log('  fetching timeline from API')

    const repoUrl = issue.repository_url
    const splitUrl = repoUrl.split('/')
    const repoOwner = splitUrl[splitUrl.length - 2]
    const timeline = await octokit.paginate(
        octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/timeline', {
            owner: repoOwner,
            repo: 'openlibrary',
            issue_number: issueNumber,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })
    )

    console.log('  storing timeline')
    issueTimelines[issueNumber] = timeline

    console.log('exiting getTimeline()')
    return timeline
}

/**
 *
 * @param issueNumber
 * @param assignees
 * @returns {Promise<boolean>}
 */
async function unassignFromIssue(issueNumber, assignees) {
    console.log('entered unassignFromIssue()')
    const wasDeleted = await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
        owner: mainOptins.repoOwner,
        repo: 'openlibrary',
        issue_number: issueNumber,
        assignees: assignees,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
        .then((response) => {
            if (!response.ok) {
                console.log(`Failed to remove assignees from issue #${issueNumber}`)
                console.log(`${response.status} ${response.statusText}`)
                throw new Error('Remove assignees call is not ok')
            }
            return true
        })
        .catch(() => false)

    console.log('exiting unassignFromIssue()')
    return wasDeleted
}

async function commentOnIssue(issueNumber, comment) {
    console.log('entered commentOnIssue()')
    const commentSucceeded = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: mainOptions.repoOwner,
        repo: 'openlibrary',
        issue_number: issueNumber,
        body: comment,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        },
    })
        .then((response) => {
            if (!response.ok) {
                console.log(`Failed to comment on issue #${issueNumber}`)
                console.log(`${response.status} ${response.statusText}`)
                throw new Error('Comment on issue call is not ok')
            }
            return true
        })
        .catch(() => false)
    console.log('exiting commentOnIssue()')
    return commentSucceeded
}
// END: API Calls

// START: Issue Filtering
/**
 * Returns the results of filtering the given issues.
 *
 * The given filters are functions that are meant to be
 * passed to Array.
 * @param issues {Array<Record>}
 * @param filters {Array<CallableFunction>}
 * @returns {Promise<Array<Record>>}
 */
async function filterIssues(issues, filters) {
    console.log('entered filterIssues()')
    let results = issues

    for (const f of filters) {
        console.log(`entering ${f}`)
        results = await f(results)
        console.log('exiting f()')
        console.log(`results.length: ${results.length}\n`)
    }
    console.log('exiting filterIssues()')
    return results
}

// Filters:
/**
 * Returns `false` if the given issue is a pull request.
 *
 * Necessary because GitHub's REST API considers pull requests to be a
 * type of issue.
 *
 * @param issue {Record}
 * @returns {Promise<boolean>}
 */
async function excludePullRequestsFilter(issue) {
    console.log(`pull_request in issue: ${'pull_request' in issue}`)
    return !('pull_request' in issue)
}

/**
 * Returns `true` if the given issue has a label that is on the exclude list.
 *
 * Label matching is case-insensitive.
 *
 * @param issue {Record}
 * @returns {Promise<boolean>}
 * @see {excludeLabels}
 */
async function excludeLabelsFilter(issue) {
    const labels = issue.labels
    for (const label of labels) {
        if (excludeLabels.includes(label.name.toLowerCase())) {
            console.log('label matched')
            return false
        }
    }
    return true
}

/**
 * Returns `true` when all assignees to the given issue also appear on the exclude
 * assignee list.
 *
 * __Important__: This function also updates the given issue. A `ol_unassign_ignore` flag
 * is added to any `assignee` that appears on the exclude list.
 *
 * @param issue {Record}
 * @returns {Promise<boolean>}
 * @see {excludeAssignees}
 */
async function excludeAssigneesFilter(issue) {
    let allAssigneesExcluded = true
    const assignees = issue.assignees
    for (const assignee of assignees) {
        const username = assignee.login
        if (!excludeAssignees.includes(username)) {
            console.log('found non-excluded assignee')
            allAssigneesExcluded = false
        } else {
            console.log('flagging to ignore')
            // Flag excluded assignees
            assignee.ol_unassign_ignore = true
        }
    }
    return !allAssigneesExcluded
}

/**
 * Returns `true` if any assignee to the given issue has been assigned
 * longer than the `daysSince` configuration.
 *
 * __Important__: This function adds the `ol_unassign_ignore` flag to
 * assignees that haven't yet been assigned for too long.
 *
 * @param issue {Record}
 * @returns {Promise<boolean>}
 */
async function recentAssigneeFilter(issue) {
    const timeline = await getTimeline(issue)
    const daysSince = mainOptions.daysSince

    const currentDate = new Date()
    const assignees = issue.assignees
    let result = true

    for (const assignee of assignees) {
        if ('ol_unassign_ignore' in assignee) {
            continue
        }
        const assignmentDate = getAssignmentDate(assignee, timeline)
        const timeDelta = currentDate.getTime() - assignmentDate.getTime()
        const daysPassed = timeDelta/(1000 * 60 * 60 * 24)
        if (daysPassed > daysSince) {
            result = false
        } else {
            assignee.ol_unassign_ignore = true
        }
    }
    return result
}

/**
 * Returns the date that the given assignee was assigned to an issue.
 *
 * @param assignee {Record}
 * @param issueTimeline {Record}
 * @returns {Date}
 */
function getAssignmentDate(assignee, issueTimeline) {
    const assigneeName = assignee.login
    const assignmentEvent = issueTimeline.findLast((event) => {
        return event.event === 'assigned' && event.assignee.login === assigneeName
    })

    if (!assignmentEvent) {  // Somehow, the assignment event was not found
        console.log('No assignment event found in issue timeline')
        // Avoid accidental unassignment by sending the current time
        return new Date()
    }

    console.log(`Assigned on ${assignmentEvent.created_at}`)
    return new Date(assignmentEvent.created_at)
}

/**
 * Returns `true` if there is no open pull linked to the given issue's assignees.
 *
 * @param issue {Record}
 * @returns {Promise<boolean>}
 */
async function linkedPullRequestFilter(issue) {
    const timeline = await getTimeline(issue)
    const assignees = issue.assignees.filter((assignee) => !('ol_unassign_ignore' in assignee))
    const crossReferences = timeline.filter((event) => event.event === 'cross-referenced')

    for (const assignee of assignees) {
        const linkedPullRequest = crossReferences.find((event) => {
            const hasLinkedPullRequest = event.source.type === 'issue' &&
                event.source.issue.state === 'open' &&
                ('pull_request' in event.source.issue) &&
                event.source.issue.user.login === assignee.login &&
                event.source.issue.body.toLowerCase().includes(`closes #${issue.number}`)
            if (hasLinkedPullRequest) {
                return false
            }
        })
    }

    return true
}
// END: Issue Filtering

console.log('finished....')
