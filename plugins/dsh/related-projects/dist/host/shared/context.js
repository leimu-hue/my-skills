function asService(ctx, name) {
    if (ctx === undefined)
        return undefined;
    try {
        const value = ctx.get(name);
        return value === undefined || value === null ? undefined : value;
    }
    catch {
        return undefined;
    }
}
export const sessionService = (ctx) => asService(ctx, 'sessions');
export const sandboxService = (ctx) => asService(ctx, 'sandboxPolicy');
export const workspaceRegistry = (ctx) => asService(ctx, 'workspaceRegistry');
export const directoryPicker = (ctx) => asService(ctx, 'directoryPickerController');
export const promptService = (scope) => asService(scope, 'systemPrompt');
export const connectionService = (ctx) => asService(ctx, 'connection');
