import { Octokit } from "@octokit/action";

console.log('starting...')
const octokit = new Octokit();

const query = 'repo:internetarchive/openlibrary is:open is:issue assignee:*'
const issues = await octokit.request('GET /search/issues', {
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    },
    params: {
      q: query,
      per_page: 100
    }
})

console.log('after fetch')
for (const issue of issues) {
    console.log(issue)
}

console.log('finishing')
