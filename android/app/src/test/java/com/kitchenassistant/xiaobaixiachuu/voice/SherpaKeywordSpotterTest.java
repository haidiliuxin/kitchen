package com.kitchenassistant.xiaobaixiachuu.voice;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SherpaKeywordSpotterTest {
    @Test
    public void pinsDeferredRuntimeInputsWithoutBundlingThem() {
        assertEquals("1.13.5", SherpaKeywordSpotter.VERSION);
        assertEquals("x iǎo b ái x iǎo b ái :1.0 #0.25 @小白小白", SherpaKeywordSpotter.KEYWORD);
    }
}
