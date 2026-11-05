package com.opentune.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.opentune.MainActivity
import com.opentune.R

/**
 * Speed Dial Widget: 1-tap launcher for favorite mixes, library shortcuts, and recommendations.
 */
class SpeedDialWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val launchIntent = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        for (id in ids) {
            val views = RemoteViews(context.packageName, R.layout.widget_speed_dial)
            views.setOnClickPendingIntent(R.id.widget_root, launchIntent)
            views.setOnClickPendingIntent(R.id.dial_item_1, launchIntent)
            views.setOnClickPendingIntent(R.id.dial_item_2, launchIntent)
            views.setOnClickPendingIntent(R.id.dial_item_3, launchIntent)
            views.setOnClickPendingIntent(R.id.dial_item_4, launchIntent)
            manager.updateAppWidget(id, views)
        }
    }
}
