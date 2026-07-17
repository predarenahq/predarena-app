import { newsHandler }     from '../lib/newsHandler.mjs'
import { momentumHandler } from '../lib/momentumHandler.mjs'

/**
 * News + momentum behind one function.
 *
 * Not a rewrite: both handlers moved to lib/ untouched. The Hobby plan caps
 * Serverless Functions at 12 and we were at 12, so the authenticated reads
 * endpoint had nowhere to live. These two are the cheapest merge on the board -
 * content only, no money path, no signing.
 *
 * Routed by ?type= rather than by body, because momentum is a GET with a query
 * string (oddsEngine calls it on the pricing path) and news is a plain GET.
 */
export default async function handler(req, res) {
  const type = req.query?.type
  if (type === 'news')     return newsHandler(req, res)
  if (type === 'momentum') return momentumHandler(req, res)
  return res.status(400).json({ error: 'invalid_type' })
}
