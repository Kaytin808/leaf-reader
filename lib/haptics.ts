// A light tap on page turns and a firmer one when a highlight is saved. The
// plugin loads on first use; on the web it falls back to navigator.vibrate,
// and any failure is ignored because haptics are only a nicety.
export type HapticFeel = 'turn' | 'saved';

let plugin: Promise<typeof import('@capacitor/haptics')> | undefined;

export function hapticTap(feel: HapticFeel) {
  plugin ??= import('@capacitor/haptics');
  void plugin
    .then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({
        style: feel === 'turn' ? ImpactStyle.Light : ImpactStyle.Medium,
      }),
    )
    .catch(() => {});
}
