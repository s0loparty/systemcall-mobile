import {BACKGROUND_BLUR_EFFECT, setBackgroundBlur} from './backgroundBlur';

describe('setBackgroundBlur', () => {
  function makeTrack(setEffects?: jest.Mock) {
    return {
      mediaStreamTrack: setEffects ? {_setVideoEffects: setEffects} : {},
    } as never;
  }

  it('enables the registered Android video effect', () => {
    const setEffects = jest.fn();

    setBackgroundBlur(makeTrack(setEffects), true, 'android');

    expect(setEffects).toHaveBeenCalledWith([BACKGROUND_BLUR_EFFECT]);
  });

  it('clears Android video effects when blur is disabled', () => {
    const setEffects = jest.fn();

    setBackgroundBlur(makeTrack(setEffects), false, 'android');

    expect(setEffects).toHaveBeenCalledWith(null);
  });

  it('throws a useful error when Android video effects are unavailable', () => {
    expect(() => setBackgroundBlur(makeTrack(), true, 'android')).toThrow(
      'Размытие фона недоступно на этом устройстве.',
    );
  });

  it('does not fail while disabling on an unsupported platform', () => {
    expect(() => setBackgroundBlur(makeTrack(), false, 'ios')).not.toThrow();
  });
});
