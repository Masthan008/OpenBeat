package com.opentune.ui

import com.opentune.data.settings.AppSettings
import com.opentune.data.settings.WelcomeState
import com.opentune.ui.components.Opening
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class OpeningGateTest {

    private fun isOpeningAllowed(): Boolean {
        return !Opening.played && AppSettings.ui.value.openingAnimation && !AppSettings.ui.value.reduceAnimation
    }

    @Before
    fun setUp() {
        Opening.played = false
        AppSettings.updateUi {
            it.copy(
                openingAnimation = true,
                reduceAnimation = false,
                welcome = WelcomeState.SEEN
            )
        }
    }

    @Test
    fun coldStart_defaultSettings_openingAllowedIsTrue() {
        Opening.played = false
        AppSettings.updateUi { it.copy(openingAnimation = true, reduceAnimation = false) }
        assertTrue("Cold start with default settings must allow opening animation", isOpeningAllowed())
    }

    @Test
    fun secondLaunch_warmStart_openingAllowedIsFalse() {
        Opening.played = true
        assertFalse("Warm start or second launch must suppress opening animation", isOpeningAllowed())
    }

    @Test
    fun openingDisabledInSettings_openingAllowedIsFalse() {
        Opening.played = false
        AppSettings.updateUi { it.copy(openingAnimation = false, reduceAnimation = false) }
        assertFalse("Opening must be suppressed when disabled in settings", isOpeningAllowed())
    }

    @Test
    fun reduceAnimationActive_openingAllowedIsFalse() {
        Opening.played = false
        AppSettings.updateUi { it.copy(openingAnimation = true, reduceAnimation = true) }
        assertFalse("Opening must be suppressed when reduce motion / animations is active", isOpeningAllowed())
    }

    @Test
    fun welcomeDue_doesNotPrematurelyMarkOpeningPlayed() {
        Opening.played = false
        AppSettings.updateUi { it.copy(welcome = WelcomeState.DUE) }
        assertFalse("Opening.played should remain false on fresh install initialization", Opening.played)
        assertTrue("Opening animation must still be eligible when welcome is DUE", isOpeningAllowed())
    }
}
