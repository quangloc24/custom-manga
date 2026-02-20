const { zencf } = require('zencf')

async function main() {
  const session = await zencf.wafSession('https://comix.to/')

  console.log('Cookies:', session.cookies)
  console.log('User-Agent:', session.headers['User-Agent'])
}

main().catch(console.error)