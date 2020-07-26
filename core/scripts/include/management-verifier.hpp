#ifndef _INCLUDE_MANAGEMENT_VERIFIER_H
#define _INCLUDE_MANAGEMENT_VERIFIER_H


#include <map>
#include <vector>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>


struct Script {
	enum Language {
		none = 0,
		wasm = 1
	} language;
	std::vector<unsigned char> code;

	bool operator==(const Script& other) const {
		return language == other.language && code == other.code;
	}
};


struct ManagementBlock {
	Script managementVerifier;
	// Script topicVerifier;
	// Script versionVerifier;
	std::map<uint32_t, std::vector<unsigned char>> metadata;
};


extern "C" {
	bool verify(const ManagementBlock& self, const ManagementBlock& block);

	ManagementBlock* _mgmtscript_newManagementBlock() {
		return new ManagementBlock();
	}
	void _mgmtscript_deleteManagementBlock(ManagementBlock* block) {
		delete block;
	}
	Script* _mgmtscript_getManagementVerifier(ManagementBlock* block) {
		return &block->managementVerifier;
	}

	void _mgmtscript_setScriptLanguage(Script* script, Script::Language language) {
		script->language = language;
	}
	unsigned char* _mgmtscript_initializeScriptCode(Script* script, size_t size) {
		script->code.resize(size);
		return script->code.data();
	}
}


#endif