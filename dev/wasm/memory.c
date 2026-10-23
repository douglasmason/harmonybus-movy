#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
static void *settings;
static size_t settings_size;
int browser_shm_open(const char *name, int flags, unsigned mode) {
    (void)flags; (void)mode;
    return strstr(name,"global") ? 7 : -1;
}
int browser_ftruncate(int descriptor, off_t size) {
    if (descriptor != 7 || size <= 0) return -1;
    if (settings) return settings_size == (size_t)size ? 0 : -1;
    settings = calloc(1, (size_t)size); settings_size = (size_t)size;
    return settings ? 0 : -1;
}
void *browser_mmap(void *address, size_t size, int prot, int flags, int descriptor, off_t offset) {
    (void)address; (void)prot; (void)flags;
    return descriptor == 7 && !offset && size == settings_size ? settings : (void *)-1;
}
int browser_close(int descriptor) { return descriptor == 7 ? 0 : -1; }
