#ifndef _INCLUDE_MANAGEMENT_VERIFIER_H
#define _INCLUDE_MANAGEMENT_VERIFIER_H


#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>


typedef struct {
	size_t size;
	char* data;
} Buffer;


typedef struct {
	enum Language {
		wasm = 1
	} language;
	Buffer data;
} Script;


typedef struct {
	uint32_t key;
	Buffer value;
} MetadataKeyValue;


typedef struct {
	size_t size;
	MetadataKeyValue* data;
} Metadata;


typedef struct {
	Script managementVerifier;
	// Script topicVerifier;
	// Script versionVerifier;
	Metadata metadata;
} ManagementBlock;


bool EMSCRIPTEN_KEEPALIVE verify(const ManagementBlock* self, const ManagementBlock* block);


#endif