all: management-verifier.wasm


%.wasm: %.cpp
	wasic++ "$<" -o "$@" -MMD -O3 \
		-Wl,--no-entry \
		-Wl,--export=verify \
		-Wl,--export=_mgmtscript_newManagementBlock \
		-Wl,--export=_mgmtscript_deleteManagementBlock \
		-Wl,--export=_mgmtscript_getManagementVerifier \
		-Wl,--export=_mgmtscript_setScriptLanguage \
		-Wl,--export=_mgmtscript_initializeScriptCode \
		-fno-exceptions \
		-Wl,--import-memory

-include management-verifier.d