export function connectionOf(ctx) {
    const value = ctx.get('connection');
    return value === undefined || value === null ? undefined : value;
}
