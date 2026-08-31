/**
 * The guard in front of `demo` and `empty`. Its whole job is to be wrong in the safe direction:
 * a local database it fails to recognise costs one `--force`, a remote one it waves through costs
 * every task in it.
 */
import { describe, expect, it } from 'vitest';
import { assertLocalTarget, describeTarget, formatTarget } from '../../src/db/target.js';

const local = [
  'postgresql://taskapp:taskapp@localhost:5432/taskapp',
  'postgresql://taskapp:taskapp@127.0.0.1:5432/taskapp',
  'postgresql://taskapp:taskapp@127.6.6.6:5432/taskapp',
  'postgresql://taskapp:taskapp@[::1]:5432/taskapp',
  'postgres://taskapp@LOCALHOST/taskapp', // scheme and case both vary in the wild
  'postgresql://taskapp:taskapp@db:5432/taskapp', // the compose service
  'postgresql://taskapp@host.docker.internal:5432/taskapp',
  'postgresql://taskapp@postgres.localhost:5432/taskapp',
];

const remote = [
  'postgresql://user:pw@db.internal.example.com:5432/taskapp',
  'postgresql://user:pw@10.0.0.5:5432/taskapp', // a private address is still someone else's machine
  'postgresql://user:pw@ep-cool-name.eu-central-1.aws.neon.tech/taskapp?sslmode=require',
  'postgresql://user:pw@dbserver:5432/taskapp', // near-miss on the compose service name
  'not a url at all',
];

describe('describeTarget', () => {
  it.each(local)('treats %s as local', (url) => {
    expect(describeTarget(url).isLocal).toBe(true);
  });

  it.each(remote)('treats %s as not local', (url) => {
    expect(describeTarget(url).isLocal).toBe(false);
  });

  it('reads the host and database out of the URL', () => {
    expect(describeTarget('postgresql://taskapp:pw@db:5432/taskapp')).toEqual({
      host: 'db',
      database: 'taskapp',
      isLocal: true,
    });
  });

  it('says so plainly when the URL cannot be parsed', () => {
    expect(describeTarget('taskapp@wherever')).toEqual({
      host: null,
      database: null,
      isLocal: false,
    });
    expect(formatTarget(describeTarget('taskapp@wherever'))).toBe(
      '(unknown database) on (unparseable DATABASE_URL)',
    );
  });
});

describe('assertLocalTarget', () => {
  it('allows a local target', () => {
    expect(
      assertLocalTarget('empty', 'postgresql://taskapp@localhost:5432/taskapp', false),
    ).toEqual({ host: 'localhost', database: 'taskapp', isLocal: true });
  });

  it('refuses a remote target, naming the command, host and database', () => {
    expect(() =>
      assertLocalTarget('empty', 'postgresql://user:pw@db.example.com:5432/production', false),
    ).toThrow(/Refusing to run "empty" against production on db\.example\.com/);
  });

  it('mentions --force, because the refusal has to say how to proceed', () => {
    expect(() =>
      assertLocalTarget('demo', 'postgresql://user:pw@db.example.com:5432/production', false),
    ).toThrow(/--force/);
  });

  it('goes ahead with --force, which is the whole point of having one', () => {
    const target = assertLocalTarget(
      'empty',
      'postgresql://user:pw@db.example.com:5432/production',
      true,
    );
    expect(target).toEqual({ host: 'db.example.com', database: 'production', isLocal: false });
  });
});
