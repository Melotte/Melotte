#include "../include/management-verifier.h"
#include <string.h>


bool buffer_equal(const Buffer a, const Buffer b) {
	return a.size == b.size && memcmp(a.data, b.data, a.size) == 0;
}


bool script_equal(const Script a, const Script b) {
	return a.language == b.language && buffer_equal(a.data, b.data);
}


bool verify(const ManagementBlock* self, const ManagementBlock* block) {
	return script_equal(self->managementVerifier, block->managementVerifier);
}