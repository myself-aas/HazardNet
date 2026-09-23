# Publication Policy — results and outputs only

**Status:** binding for this repository and for hazardnet.live.

HazardNet publishes **results and outputs only**. The following are research-private and
must never appear in this repository, on the website, in CI, in issue text, or in any
other public surface:

1. **Model code** — architecture, implementation, inference code, model internals.
2. **Dataset collection procedures** — sources, layer/band composition, acquisition and
   preprocessing steps, collection tooling and datasets themselves.
3. **Training** — pipelines, notebooks, hyperparameters, experiment records, registries.
4. **Benchmarking** — evaluation methodology, sweeps, driver diagnostics and formulas.
5. **All other confidential information** — internal decision records, ledgers, claims
   registries, gate scripts and process documents.

### What is public

- published forecast records and the snapshots that serve them
- published alert levels and run reports
- the validation scorecard's headline counts (with their plain limitations)
- the freshness/provenance record
- the web application code that presents these results
- `Models/` — trained artifacts retained **unadvertised** (not linked, not downloadable
  through any page, not described publicly)

Trained artifacts in `Models/` may be removed at any time; nothing may ever link to them.

## Git history — required purge before republication

Deleted files remain recoverable in git history on GitHub. **File removal from the tree is
not sufficient.** Before this repository is treated as clean, the owner must purge history:

```bash
# Option A — git-filter-repo (recommended)
pip install git-filter-repo
git clone --mirror git@github.com:myself-aas/HazardNet.git HazardNet-mirror.git
cd HazardNet-mirror.git
git filter-repo --invert-paths \
  --path <each removed path from the confidentiality cleanup commit> \
  --path-glob '*.ipynb'
git push --force --mirror
cd .. && rm -rf HazardNet-mirror.git

# Option B — fresh repository (simplest and safest)
# Create a new repository containing only the current cleaned tree, transfer
# GitHub settings, then archive or delete the old repository.
```

Additional required owner actions:

- Invalidate GitHub cache/CDN copies: contact GitHub Support to remove cached views of
  removed paths (commits, PR diffs) after the history rewrite.
- Treat any forks/clones made before the purge as containing confidential material.
- Rotate any credentials that ever appeared in CI variables or workflow text.
- Redeploy hazardnet.live from the cleaned history so the site build cannot resurrect
  removed artifacts.

## Maintenance rules

- CI and scripts must not reintroduce pipeline, collection, training or benchmark code.
- Public copy must not describe method — only what the system outputs.
- Third-party licence attributions that are legally required (map data, weather data
  credits) stay; they are obligations, not disclosures of method.

## Execution record — 2026-09-24 (in-sandbox)

Route B semantics were executed in place on branch `arena/01a0cf2b-hazardnet`
(no repository move; the working tree is byte-identical before and after):

1. A final string-level sweep removed the last in-tree confidential tokens
   (the personal forecast-run slug, internal research-service references, dead
   pointers to removed builder scripts) and a canary grep over the tree returned zero hits.
2. The entire history was collapsed to a **single clean root commit** whose tree
   is the cleaned tree (verified by comparing tree hashes across the rewrite).
3. `git reflog expire --expire=now --expire-unreachable=now --all` and
   `git gc --prune=now --aggressive` were run; the old commits and their blobs
   are unreachable and pruned from the local object store.
   `git cat-file --batch-all-objects` canary search returns **zero** hits for
   purged material.
4. Local `refs/remotes/origin/*` were cleared so the old remote history is not
   retained in this clone.

**Still required from the owner** (the sandbox could not push — GitHub auth was
unavailable — and pushing `main` is out of scope for the session branch):

```bash
# 1. publish the cleaned history (force is required — hashes changed)
git push --force origin arena/01a0cf2b-hazardnet

# 2. publish main (already repointed to the cleaned commit locally)
git push --force origin main

# 3. after both pushes, ask GitHub Support to purge cached views and PR diffs
#    of the old commits, then redeploy hazardnet.live from the cleaned history
```

Plus the standing actions above: treat all pre-purge forks/clones/CI caches as
confidential, and rotate every credential that ever appeared in CI variables,
workflow text, or the old history.
