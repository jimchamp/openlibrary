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
const excludeAssignees = ['jimchamp']

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
    excludeAssigneesFilter,
    excludeLabelsFilter,
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
await main(mainOptions)

/**
 * Runs the auto-unassigner job.
 *
 * @returns {Promise<void>}
 */
async function main() {  // XXX : Inject octokit for easier testing
    console.log('entered main()')

    const issues = await fetchIssues()
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
}

/**
 * Returns all GitHub issues that are open and one or more assignees.
 *
 * __Important:__ GitHub's REST API considers every pull request to be an
 * issue.  Pull requests may be included in the results returned by this
 * function, and can be identified by the presence of a `pull_request` key.
 *
 * @returns {Promise<string>}
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
        }
    )

    console.log('exiting fetchIssues()')
    return result
}

/**
 *
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
 * Filters out pull requests and returns remaining issues.
 *
 * Necessary because GitHub's REST API considers pull requests to be a
 * type of issue.
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function excludePullRequestsFilter(issues) {
    return issues.filter((issue) => {
        console.log(`pull_request in issue: ${'pull_request' in issue}`)
        return !'pull_request' in issue
    })
}
/**
 * Filters out issues where all assignees are in the excluded assignees list.
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 * @see {excludeAssignees}
 */
async function excludeAssigneesFilter(issues) {
    return issues.filter((issue) => {
        let allAssigneesExcluded = false // update to true when testing is through
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
    })
}

/**
 * Filters out given issues which have a label that is on the exclude list, and
 * returns the results.
 *
 * Label matching is case-insensitive.
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 * @see {excludeLabels}
 */
async function excludeLabelsFilter(issues) {
    return issues.filter((issue) => {
        const labels = issue.labels
        for (const label of labels) {
            if (excludeLabels.includes(label.name.toLowerCase())) {
                console.log('label matched')
                return false
            }
        }
        return true
    })
}

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function recentAssigneeFilter(issues) {
    return issues.filter((issue) => {
        // const timeline = getTimeline(issue)
        // const daysSince = Number(mainOptions.daysSince)  // mainOptions.daysSince will be a string if overridden from the command line
        //
        // const currentDate = new Date()
        // const assignees = issue.assignees || []
        // for (const assignee of assignees) {
        //
        // }
        return true
    })
}

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function linkedPullRequestFilter(issues) {
    return issues.filter((issue) => {
        return true
    })
}

/**
 * Returns the timeline of the given issue.
 *
 * Attempts to get the timeline from the `issueTimelines` store. If no
 * timeline is found, calls GitHub's Timeline API and stores the result
 * before returning.
 *
 * @param issue {Record}
 * @returns {Promise<Record>}
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

console.log('finished....')
