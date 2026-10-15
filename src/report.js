import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';
import { ensureDir, nowIso } from './util.js';

/** Build the run report, write report.json + report.md, and print a summary. */
export function buildReport({ region, target, niches, files }) {
  const pointAgg = new Map();
  for (const n of niches)
    for (const tp of n.top_points) pointAgg.set(tp.name, (pointAgg.get(tp.name) || 0) + tp.count);
  const topPointsOverall = [...pointAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const report = {
    generated_at: nowIso(),
    region: region.name,
    region_id: region.id,
    target_per_niche: target,
    totals: {
      firms: niches.reduce((s, n) => s + n.found, 0),
      duplicates_removed: niches.reduce((s, n) => s + n.duplicates_removed, 0),
      niches: niches.length,
      niches_met: niches.filter((n) => n.target_met).length,
    },
    niches: niches.map((n) => ({
      niche: n.niche,
      rubric_id: n.rubric_id,
      rubric_name: n.rubric_name,
      rubric_ids: n.rubric_ids,
      rubric_names: n.rubric_names,
      used_q_fallback: n.used_q_fallback,
      found: n.found,
      target: n.target,
      target_met: n.target_met,
      duplicates_removed: n.duplicates_removed,
      api_calls: n.api_calls,
      points_used: n.points_used,
      top_points: n.top_points,
    })),
    top_points_overall: topPointsOverall,
    under_target: niches.filter((n) => !n.target_met).map((n) => ({ niche: n.niche, found: n.found, target: n.target })),
    files,
  };

  ensureDir(paths.output);
  fs.writeFileSync(path.join(paths.output, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(paths.output, 'report.md'), toMarkdown(report), 'utf8');
  printConsole(report);
  return report;
}

function toMarkdown(r) {
  const L = [];
  L.push(`# 2GIS collection report — ${r.region}`, '');
  L.push(`- Generated: ${r.generated_at}`);
  L.push(`- Region: **${r.region}** (id ${r.region_id})`);
  L.push(`- Target per niche: **${r.target_per_niche}**`);
  L.push(`- Total firms: **${r.totals.firms}**, duplicates removed: **${r.totals.duplicates_removed}**`);
  L.push(`- Niches meeting target: **${r.totals.niches_met}/${r.totals.niches}**`, '');
  L.push('## Per niche', '');
  L.push('| Niche | Rubric(s) | rubric_ids | Found | Target | Met | Dupes | Points | API calls |');
  L.push('|---|---|---|---:|---:|:-:|---:|---:|---:|');
  for (const n of r.niches) {
    const extra = n.rubric_ids && n.rubric_ids.length > 1 ? ` (+${n.rubric_ids.length - 1})` : '';
    const rubric = (n.rubric_name || (n.used_q_fallback ? 'q-fallback' : '—')) + extra;
    const ids = n.rubric_ids && n.rubric_ids.length ? n.rubric_ids.join(', ') : '—';
    L.push(`| ${n.niche} | ${rubric} | ${ids} | ${n.found} | ${n.target} | ${n.target_met ? '✅' : '❌'} | ${n.duplicates_removed} | ${n.points_used} | ${n.api_calls} |`);
  }
  L.push('', '## Top points (by unique firms contributed)', '');
  for (const p of r.top_points_overall) L.push(`- ${p.name}: ${p.count}`);
  L.push('');
  if (r.under_target.length) {
    L.push('## Niches under target', '');
    for (const u of r.under_target) L.push(`- ⚠️ ${u.niche}: ${u.found}/${u.target}`);
  } else {
    L.push('_All niches met the target._');
  }
  L.push('', '## Files', '');
  for (const [k, v] of Object.entries(r.files)) L.push(`- ${k}: \`${v}\``);
  return L.join('\n') + '\n';
}

function printConsole(r) {
  const L = [];
  L.push('');
  L.push('══════════════════════════════════════════════════════════════════');
  L.push(`  2GIS COLLECTION REPORT — ${r.region} (region_id ${r.region_id})`);
  L.push('══════════════════════════════════════════════════════════════════');
  L.push(`  Target/niche: ${r.target_per_niche}    Total firms: ${r.totals.firms}    Dupes removed: ${r.totals.duplicates_removed}`);
  L.push(`  Niches meeting target: ${r.totals.niches_met}/${r.totals.niches}`);
  L.push('──────────────────────────────────────────────────────────────────');
  L.push('  NICHE                    FOUND/TARGET  MET   DUPES  POINTS  CALLS');
  for (const n of r.niches) {
    const niche = n.niche.padEnd(22).slice(0, 22);
    const ft = `${n.found}/${n.target}`.padStart(11);
    const met = (n.target_met ? 'yes' : 'NO').padStart(4);
    const dupes = String(n.duplicates_removed).padStart(6);
    const pts = String(n.points_used).padStart(7);
    const calls = String(n.api_calls).padStart(6);
    L.push(`  ${niche} ${ft}  ${met} ${dupes} ${pts} ${calls}`);
  }
  L.push('──────────────────────────────────────────────────────────────────');
  L.push('  TOP POINTS (unique firms contributed):');
  for (const p of r.top_points_overall.slice(0, 8)) L.push(`    ${String(p.count).padStart(4)}  ${p.name}`);
  if (r.under_target.length) {
    L.push('──────────────────────────────────────────────────────────────────');
    L.push('  ⚠ NICHES UNDER TARGET:');
    for (const u of r.under_target) L.push(`    ${u.niche}: ${u.found}/${u.target}`);
  }
  L.push('──────────────────────────────────────────────────────────────────');
  L.push('  FILES:');
  for (const [k, v] of Object.entries(r.files)) L.push(`    ${k.padEnd(15)} ${v}`);
  L.push('══════════════════════════════════════════════════════════════════');
  L.push('');
  process.stdout.write(L.join('\n') + '\n');
}
