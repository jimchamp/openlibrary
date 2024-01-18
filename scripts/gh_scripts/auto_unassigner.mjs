import { Octokit } from "@octokit/action";

console.log('starting...')
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
    assigneeExistsFilter,
    excludeAssigneesFilter,
    excludeLabelsFilter,
    recentAssigneeFilter,
    linkedPullRequestFilter
]

const query = 'repo:jimchamp/openlibrary is:open is:issue'


await main()

async function main() {
    console.log('entered main()')
    const result = await fetchIssues(query)
    console.log('\nresult:')
    console.log(result)

    // XXX : Is it possible that data or items is undefined?
    const issues = result.data?.items

    if (!issues) {
        console.log('No issues were returned by the initial query')
        return
    }

    const actionableIssues = await filterIssues(issues, filters)
    console.log('\nactionableIssues:')
    console.log(actionableIssues)
    console.log('exiting main()')
}


async function fetchIssues(query) {
    console.log('entered fetchIssues()')
    const result = await octokit.request('GET /repos/{owner}/{repo}/issues', {
        owner: 'jimchamp',
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
 *
 * @param issues {Array<Record>}
 * @param filters {Array<CallableFunction>}
 * @returns {Promise<Array<Record>>}
 */
async function filterIssues(issues, filters) {
    console.log('entered filterIssues()')
    let results = []

    for (const f of filters) {
        console.log(`entering ${f}`)
        results = await f()
        console.log(`\nexited f()`)
    }
    console.log('exiting filterIssues()')
    return results
}

// Filters:

/**
 * Filters given issues, returning issues that have at least one assignee.
 *
 * @param issues {Array<Record>}
 * @returns {Promise<Array<Record>>}
 */
async function assigneeExistsFilter(issues) {
    return issues
}

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
