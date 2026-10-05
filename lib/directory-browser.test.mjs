import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function loadSubject() {
  return import("./directory-browser.ts");
}

test("lists directories and directory symlinks without returning files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-browse-"));
  try {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "notes.txt"), "test", "utf8");
    await symlink(path.join(root, "project"), path.join(root, "linked-project"));

    const { listDirectories } = await loadSubject();
    const directories = await listDirectories(root);

    assert.deepEqual(directories.map((entry) => entry.name), ["linked-project", "project"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expands home-relative paths and rejects missing directories", async () => {
  const {
    getBrowseStartDirectory,
    normalizeDirectory,
    resolveDirectory,
    shouldShowWindowsDrivePicker,
  } = await loadSubject();
  assert.equal(getBrowseStartDirectory(), homedir());
  assert.equal(getBrowseStartDirectory("/project"), "/project");
  assert.equal(shouldShowWindowsDrivePicker(undefined, "win32"), true);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "darwin"), false);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "linux"), false);
  assert.equal(shouldShowWindowsDrivePicker("C:\\Projects", "win32"), false);
  assert.equal(normalizeDirectory("~/project"), path.join(homedir(), "project"));
  await assert.rejects(resolveDirectory(path.join(tmpdir(), `pi-web-missing-${Date.now()}`)));
});

test("builds every Windows drive-letter candidate", async () => {
  const { getWindowsDriveCandidates } = await loadSubject();
  const drives = getWindowsDriveCandidates();

  assert.equal(drives.length, 26);
  assert.deepEqual(drives[0], { name: "A:", path: "A:\\" });
  assert.deepEqual(drives.at(-1), { name: "Z:", path: "Z:\\" });
});

test("finds parent directories across POSIX and Windows paths", async () => {
  const { getParentDirectory } = await loadSubject();

  assert.equal(getParentDirectory("/Users/alex/project"), "/Users/alex");
  assert.equal(getParentDirectory("/"), null);
  assert.equal(getParentDirectory("C:\\Users\\Alex\\project"), "C:\\Users\\Alex");
  assert.equal(getParentDirectory("C:\\"), null);
});

test("completes a partial directory name under an existing parent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-complete-"));
  try {
    await mkdir(path.join(root, "alpha"));
    await mkdir(path.join(root, "alpine"));
    await mkdir(path.join(root, "beta"));
    const { completeDirectories } = await loadSubject();

    const result = await completeDirectories(path.join(root, "al"), 20);
    assert.equal(result.base, await realpath(root));
    assert.equal(result.fragment, "al");
    assert.deepEqual(result.matches.map((entry) => entry.name), ["alpha", "alpine"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("walks up to the deepest existing ancestor for a partly written path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-complete-"));
  try {
    await mkdir(path.join(root, "one"));
    const { completeDirectories } = await loadSubject();

    const result = await completeDirectories(path.join(root, "one", "tw"), 20);
    assert.equal(result.base, await realpath(path.join(root, "one")));
    assert.equal(result.fragment, "tw");
    assert.deepEqual(result.matches, []);

    // Two missing segments collapse to the first unmatched one under the base.
    const deep = await completeDirectories(path.join(root, "one", "x", "y"), 20);
    assert.equal(deep.base, await realpath(path.join(root, "one")));
    assert.equal(deep.fragment, "x");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lists every child for an existing directory without truncating", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-complete-"));
  try {
    await mkdir(path.join(root, "a"));
    await mkdir(path.join(root, "b"));
    await mkdir(path.join(root, "c"));
    const { completeDirectories } = await loadSubject();

    const all = await completeDirectories(root, 20);
    assert.equal(all.base, await realpath(root));
    assert.equal(all.fragment, "");
    assert.deepEqual(all.matches.map((entry) => entry.name), ["a", "b", "c"]);

    // A typed directory is the browse case: the limit does not truncate it.
    const capped = await completeDirectories(root, 2);
    assert.deepEqual(capped.matches.map((entry) => entry.name), ["a", "b", "c"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns an empty completion for blank input and for paths with no existing ancestor", async () => {
  const { completeDirectories } = await loadSubject();

  assert.deepEqual(await completeDirectories("", 20), { base: null, fragment: "", matches: [] });
  assert.deepEqual(await completeDirectories("   ", 20), { base: null, fragment: "", matches: [] });
});

test("matches a fragment anywhere in a name, mid-name included", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-complete-"));
  try {
    await mkdir(path.join(root, "components"));
    await mkdir(path.join(root, "docs"));
    const { completeDirectories } = await loadSubject();

    const result = await completeDirectories(path.join(root, "omp"), 20);
    assert.equal(result.base, await realpath(root));
    assert.equal(result.fragment, "omp");
    assert.deepEqual(result.matches.map((entry) => entry.name), ["components"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a typed directory lists all of its children, not just the limit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-complete-"));
  try {
    for (const name of [".cache", ".config", "alpha", "beta", "gamma"]) {
      await mkdir(path.join(root, name));
    }
    const { completeDirectories } = await loadSubject();

    const result = await completeDirectories(root + path.sep, 2);
    assert.equal(result.base, await realpath(root));
    assert.equal(result.fragment, "");
    assert.deepEqual(
      result.matches.map((entry) => entry.name),
      [".cache", ".config", "alpha", "beta", "gamma"],
    );

    // A fragment still caps.
    const filtered = await completeDirectories(path.join(root, "al"), 1);
    assert.deepEqual(filtered.matches.map((entry) => entry.name), ["alpha"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
