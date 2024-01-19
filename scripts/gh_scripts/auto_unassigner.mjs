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
 * @returns {Record}
 */
function parseArgs() {
    const result = {}
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
 */
const excludeAssignees = []
/**
 * List of GitHub labels that, if on an issue, excludes the issue from automation.
 * @type {String[]}
 */
const excludeLabels = []

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
    excludeAssigneesFilter,
    excludeLabelsFilter,
    recentAssigneeFilter,
    linkedPullRequestFilter
]

const mainOptions = Object.assign({}, DEFAULT_OPTIONS, passedArguments)
await main(mainOptions)

/**
 * Runs the auto-unassigner job.
 *
 * @param options {Record}
 * @returns {Promise<void>}
 */
async function main(options) {  // XXX : Inject octokit for easier testing
    console.log('entered main()')
    const daysSince = Number(options.daysSince)
    const repoOwner = options.repoOwner

    console.log(`daysSince: ${daysSince}`)
    console.log(`type: ${typeof daysSince}`)
    console.log(`repoOwner: ${repoOwner}`)
    console.log(`type: ${repoOwner}`)

    const issues = await fetchIssues(repoOwner)
    console.log('\nissues:')
    console.log(issues)
    console.log(`length: ${issues.length}`)

    if (issues.length === 0) {
        console.log('No issues were returned by the initial query')
        return
    }

    const actionableIssues = await filterIssues(issues, filters)
    console.log('\nactionableIssues:')
    console.log(actionableIssues)
    console.log('exiting main()')
}


async function fetchIssues(repoOwner) {
    console.log('entered fetchIssues()')
    const result = await octokit.paginate('GET /repos/{owner}/{repo}/issues', {
                owner: repoOwner,
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
    console.log('\nissues:')
    console.log(issues)
    let results = issues

    for (const f of filters) {
        console.log(`\nentering ${f}`)
        results = await f(results)
        console.log(`\nexited f()`)
        console.log('results:')
        console.log(results)
    }
    console.log('exiting filterIssues()')
    return results
}

// Filters:

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function excludeAssigneesFilter(issues) {
    return issues
}

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function excludeLabelsFilter(issues) {
    return issues
}

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function recentAssigneeFilter(issues) {
    return issues
}

/**
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function linkedPullRequestFilter(issues) {
    return issues
}

console.log('finished....')
