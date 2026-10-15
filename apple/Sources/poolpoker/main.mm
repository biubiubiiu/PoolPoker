#include "bindings/bindings.h"
extern "C" void poolpoker_watch_start(void);

int main(int argc, char * argv[]) {
	poolpoker_watch_start();
	ffi::start_app();
	return 0;
}
