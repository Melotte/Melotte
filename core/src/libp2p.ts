// node_modules/libp2p is curently a symlink to an outer directory. This hack is
// tracked by:
// https://stackoverflow.com/questions/63135990/how-to-import-a-non-typescript-module-by-relative-path
import Libp2p from "libp2p";
export default Libp2p;