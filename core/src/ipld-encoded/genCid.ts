'use strict'

import CID from 'cids'
import multicodec from 'multicodec'
import multihashing from 'multihashing-async'

export const codec = multicodec.MELOTTE_ENCODED
export const defaultHashAlg = multicodec.SHA2_256

/**
 * Calculate the CID of the binary blob.
 *
 * @param {Object} binaryBlob - Encoded IPLD Node
 * @param {Object} [userOptions] - Options to create the CID
 * @param {number} [userOptions.cidVersion=1] - CID version number
 * @param {string} [UserOptions.hashAlg] - Defaults to the defaultHashAlg of the format
 * @returns {Promise.<CID>}
 */

export async function cid(binaryBlob: Buffer, userOptions: any): Promise<CID> {
  const defaultOptions = {cidVersion: 1, hashAlg: exports.defaultHashAlg}
  const options = Object.assign(defaultOptions, userOptions)

  const multihash = await multihashing(binaryBlob, options.hashAlg)
  const codecName = multicodec.print[exports.codec]
  const cid = new CID(options.cidVersion, codecName, multihash)

  return cid
}

