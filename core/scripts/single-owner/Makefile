all: management-verifier.wasm


%.wasm: %.c
	emcc "$<" -o "$@" -O3 -MMD

-include management-verifier.d