import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('templates/github/compile-srs.yml', 'utf8');

describe('stateless SRS compiler workflow', () => {
  it('is a private-repository installation template, not a source-repository workflow', () => {
    expect(workflow).toContain('workflow_dispatch:');
  });
  it('is dispatch-only and does not read or write repository contents', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s+push:/m);
    expect(workflow).not.toMatch(/^\s+schedule:/m);
    expect(workflow).not.toContain('actions/checkout');
    expect(workflow).not.toContain('git push');
    expect(workflow).toContain('permissions: {}');
  });

  it('pins the compiler archive and verifies the official digest', () => {
    expect(workflow).toContain('SING_BOX_VERSION: 1.13.14');
    expect(workflow).toContain('SING_BOX_ARCHIVE: sing-box-1.13.14-linux-amd64.tar.gz');
    expect(workflow).toContain('SING_BOX_SHA256: f48703461a15476951ac4967cdad339d986f4b8096b4eb3ff0829a500502d697');
    expect(workflow).toContain('sha256sum --check --strict');
    expect(workflow).not.toContain('/releases/latest');
  });

  it('uses only opaque job exchange endpoints and a short-lived job ticket', () => {
    expect(workflow).toContain('inputs.job_id');
    expect(workflow).toContain('inputs.worker_url');
    expect(workflow).toContain('inputs.job_ticket');
    expect(workflow).toContain('::add-mask::${JOB_TICKET}');
    expect(workflow).not.toContain('vars.');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).toContain('/internal/srs-jobs/${JOB_ID}/source');
    expect(workflow).toContain('/internal/srs-jobs/${JOB_ID}/complete');
    expect(workflow).toContain('/internal/srs-jobs/${JOB_ID}/failed');
    expect(workflow).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(workflow).not.toContain('R2_');
  });
});
