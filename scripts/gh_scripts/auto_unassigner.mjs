import { Octokit } from "@octokit/action";

console.log('starting...')
// Octokit is authenticated with the `GITHUB_TOKEN` that is added to the
// environment in the `auto_unassigner` workflow
const octokit = new Octokit();

const query = 'repo:jimchamp/openlibrary is:open is:issue'

main()

async function main() {
  console.log('entered main()')
  const result = await fetchIssues(query)
  console.log('result:')
  console.log(result)

  // XXX : Is it possible that data or items is undefined?
  const issues = result.data.items
  console.log('issues:')
  console.log(issues)

  if (issues) {
      console.log('there are issues')
      for (const i of issues) {
          console.log(i)
      }
  }

  console.log('exiting main()')
}


async function fetchIssues(query) {
  console.log('entered fetchIssues()')
  const result = await octokit.request('GET /search/issues', {
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      },
      q: query,
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
  console.log('exiting filterIssues()')
  return []
}

console.log('finished....')
