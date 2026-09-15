'use strict';

// electron-builder `afterPack` hook — give the packaged macOS app a valid
// **ad-hoc** signature when no Developer ID certificate is available.
//
// Why: with CSC_IDENTITY_AUTO_DISCOVERY=false, electron-builder skips code
// signing entirely (macPackager.sign() bails out of isSignAllowed()), so the
// shipped .app had no _CodeSignature at all and its x86_64 slice carried no
// LC_CODE_SIGNATURE. An unsigned bundle is what makes macOS call the app
// "damaged", and it is one of the conditions that sends a quarantined download
// through XProtect's YARA scan on first launch (see docs/MACOS-INSTALL.md).
//
// An ad-hoc signature is NOT a substitute for notarization — it does not stop
// Gatekeeper's "unidentified developer" block — but it makes the bundle
// well-formed, which is the part we can fix without a paid Apple account.
//
// When real signing credentials are present this hook stands aside: electron-
// builder signs (and notarizes) right after afterPack, with the entitlements
// from build/entitlements.mac*.plist.

const { execFileSync } = require('child_process');
const path = require('path');

// Pure decision: the .app to ad-hoc sign, or null to do nothing.
//   ctx  - the electron-builder afterPack context (the fields we care about)
//   env  - process.env
//   host - process.platform of the machine running the build
function appToAdhocSign(ctx, env, host) {
  if (ctx.electronPlatformName !== 'darwin') return null;
  // `codesign` only exists on macOS; a --mac build from Linux/Windows can't sign.
  if (host !== 'darwin') return null;
  // A real Developer ID build signs properly a moment later — don't spend the
  // minutes it takes to ad-hoc sign a 200 MB universal bundle first.
  if (env.CSC_LINK || env.CSC_NAME) return null;
  // For a universal build electron-builder packs x64 and arm64 into
  // "<appOutDir>-x64-temp" / "<appOutDir>-arm64-temp" and calls this hook for
  // each of them, then once more on the merged app. Signing the two halves
  // would leave them with differing _CodeSignature trees, and
  // @electron/universal refuses to merge files that differ — so only the merged
  // app (no "-temp" suffix) is signed.
  if (/-temp$/.test(ctx.appOutDir)) return null;
  return path.join(ctx.appOutDir, `${ctx.productFilename}.app`);
}

module.exports = async function adhocSignMac(context) {
  const appPath = appToAdhocSign(
    { electronPlatformName: context.electronPlatformName,
      appOutDir: context.appOutDir,
      productFilename: context.packager.appInfo.productFilename },
    process.env,
    process.platform,
  );
  if (!appPath) return;

  console.log(`  • ad-hoc signing ${appPath}`);
  try {
    // --deep is deprecated for distribution signing but remains the practical
    // way to ad-hoc sign every nested helper, framework and unpacked binary.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
    console.log('  • ad-hoc signature applied and verified');
  } catch (err) {
    // Never fail the build over this: an unsigned build is still shippable
    // (that is what every release up to now was).
    console.warn(`  • ad-hoc signing failed, shipping unsigned: ${err.message}`);
  }
};

module.exports.appToAdhocSign = appToAdhocSign;
