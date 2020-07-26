#include "../include/management-verifier.hpp"


bool verify(const ManagementBlock& self, const ManagementBlock& block) {
	return self.managementVerifier == block.managementVerifier;
}