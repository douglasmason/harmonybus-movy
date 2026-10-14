/* Give each native host process its own HB shared-memory namespace. */
#include <sys/mman.h>
#include <sys/stat.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
static char names[16][160];
static int count;
static void cleanup(void) { for(int index=0;index<count;index++)shm_unlink(names[index]); }
int hb_dev_shm_open(const char *name,int flags,unsigned mode) {
    char local[160];snprintf(local,sizeof(local),"/hb-dev-%ld-%s",(long)getpid(),name[0]=='/'?name+1:name);
    int descriptor=shm_open(local,flags,mode);
    if(descriptor>=0) {
        if(!count)atexit(cleanup);
        int known=0;for(int index=0;index<count;index++)if(!strcmp(names[index],local))known=1;
        if(!known&&count<16)snprintf(names[count++],sizeof(names[0]),"%s",local);
    }
    return descriptor;
}
