/*
 * MelonLoader macOS symbol-redirect shim.
 *
 * MelonLoader PLT-hooks dlsym in UnityPlayer.dylib to catch the game resolving
 * il2cpp_init. Under Rosetta plthook_replace reports success and the hook never
 * fires — measured: UnityPlayer makes 234 il2cpp_* lookups and the hook sees
 * none of them.
 *
 * A dyld interpose catches all 234. Curiously, interposing dlsym from inside
 * MelonLoader's own bootstrap does not work either (its setrlimit interpose, in
 * the same file, does) — so the interpose lives here, in a separate library,
 * which is the arrangement proven to work.
 *
 * All this does is forward to MelonLoader's own detour, which it exports as
 * MelonSymbolDetour. None of the redirect logic is reimplemented.
 */
#include <dlfcn.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>

typedef void *(*detour_fn)(void *handle, const char *symbol);

static detour_fn g_detour = NULL;
static int g_looked = 0;

/* Per-thread, because the detour may run on more than one. */
static __thread int g_inDetour = 0;

/* Only the families MelonLoader actually redirects. Everything else goes
 * straight through, so nothing else in the process pays for this. */
static int interesting(const char *symbol)
{
    return strncmp(symbol, "il2cpp", 6) == 0 || strncmp(symbol, "mono", 4) == 0;
}

static void *my_dlsym(void *handle, const char *symbol)
{
    if (symbol == NULL || !interesting(symbol))
        return dlsym(handle, symbol);

    /* Resolved lazily: the bootstrap has to be loaded and its runtime up before
     * the detour can be called, and that happens after this library loads. */
    if (!g_looked)
    {
        g_looked = 1;
        g_detour = (detour_fn)dlsym(RTLD_DEFAULT, "MelonSymbolDetour");
        FILE *f = fopen("/tmp/shim.log", "a");
        if (f) { fprintf(f, "first interesting symbol=%s detour=%p\n", symbol, (void *)g_detour); fclose(f); }
    }

    if (g_detour != NULL && !g_inDetour)
    {
        g_inDetour = 1;
        void *r = g_detour(handle, symbol);
        g_inDetour = 0;
        return r;
    }

    return dlsym(handle, symbol);
}

static void *my_dlopen(const char *path, int mode)
{
    if (path != NULL && strstr(path, "GameAssembly") != NULL)
    {
        FILE *f = fopen("/tmp/shim.log", "a");
        if (f) { fprintf(f, "dlopen GameAssembly\n"); fclose(f); }
    }
    return dlopen(path, mode);
}

__attribute__((used)) static struct
{
    const void *replacement;
    const void *replacee;
} interposers[] __attribute__((section("__DATA,__interpose"))) = {
    {(const void *)(unsigned long)&my_dlsym, (const void *)(unsigned long)&dlsym},
    {(const void *)(unsigned long)&my_dlopen, (const void *)(unsigned long)&dlopen},
};
