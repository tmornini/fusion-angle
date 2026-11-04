// The commit the process is running. Callers pass a
// sha captured at start. A missing one is read here.
// The compiled binary has no git and no run
// permission, so a failed read is absence, not a crash.

const GIT_SHA = /^[0-9a-f]{40}$/;

export function parseGitSha(
    text: string,
): string | undefined {
    const sha = text.trim();
    if (!GIT_SHA.test(sha)) return undefined;
    return sha;
}

export async function readWorktreeGitSha(): Promise<
    string | undefined
> {
    const fromEnv = Deno.env.get('GIT_SHA');
    if (fromEnv !== undefined && fromEnv !== '') {
        return parseGitSha(fromEnv);
    }
    try {
        const output = await new Deno.Command('git', {
            args: ['rev-parse', 'HEAD'],
            stdout: 'piped',
            stderr: 'null',
        }).output();
        if (!output.success) return undefined;
        return parseGitSha(
            new TextDecoder().decode(output.stdout),
        );
    } catch {
        return undefined;
    }
}

export async function gitShaForStatus(
    given: string | undefined,
): Promise<string | undefined> {
    if (given !== undefined) return parseGitSha(given);
    return await readWorktreeGitSha();
}
