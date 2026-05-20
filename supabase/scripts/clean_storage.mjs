#!/usr/bin/env node
// ============================================================
// clean_storage.mjs — Maintenance script
// Deletes all objects from test buckets, preserving avatars.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=ey... \
//   node supabase/scripts/clean_storage.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const BUCKETS_TO_CLEAN = ['class-media', 'posts-media', 'payment-receipts', 'audition-videos']

/** Recursively list all file paths under a prefix in a bucket. */
async function listAllFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  })

  if (error) {
    console.error(`  Error listing ${bucket}/${prefix}:`, error.message)
    return []
  }
  if (!data || data.length === 0) return []

  const files = []
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) {
      // Folder — recurse
      const sub = await listAllFiles(bucket, fullPath)
      files.push(...sub)
    } else {
      files.push(fullPath)
    }
  }
  return files
}

async function cleanBucket(bucket) {
  console.log(`\nCleaning: ${bucket}`)

  const allFiles = await listAllFiles(bucket)

  if (allFiles.length === 0) {
    console.log(`  Already empty.`)
    return
  }

  console.log(`  Found ${allFiles.length} file(s). Deleting...`)

  // Supabase remove() accepts up to 1000 paths at once
  const batchSize = 1000
  let deleted = 0
  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize)
    const { error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      console.error(`  Error deleting batch:`, error.message)
    } else {
      deleted += batch.length
    }
  }
  console.log(`  Deleted ${deleted} file(s).`)
}

async function main() {
  console.log('=== DanzClass Storage Cleanup ===')
  console.log('Buckets to clean:', BUCKETS_TO_CLEAN.join(', '))
  console.log('Preserved: avatars')

  for (const bucket of BUCKETS_TO_CLEAN) {
    await cleanBucket(bucket)
  }

  console.log('\n=== Done ===')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
