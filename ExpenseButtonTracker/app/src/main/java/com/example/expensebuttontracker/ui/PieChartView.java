package com.example.expensebuttontracker.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

public class PieChartView extends View {
    private final Paint slicePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint centerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();
    private final ArrayList<Slice> slices = new ArrayList<>();

    public PieChartView(Context context) {
        super(context);
        centerPaint.setColor(0xFFFFFFFF);
        textPaint.setColor(0xFF5F6B7A);
        textPaint.setTextAlign(Paint.Align.CENTER);
        setMinimumHeight(dp(220));
    }

    public void setSlices(List<Slice> newSlices) {
        slices.clear();
        if (newSlices != null) {
            slices.addAll(newSlices);
        }
        invalidate();
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int desiredHeight = dp(220);
        int height = resolveSize(desiredHeight, heightMeasureSpec);
        setMeasuredDimension(width, height);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        int size = Math.min(width - getPaddingLeft() - getPaddingRight(), height - getPaddingTop() - getPaddingBottom());
        if (size <= 0) {
            return;
        }

        float left = (width - size) / 2f;
        float top = (height - size) / 2f;
        bounds.set(left, top, left + size, top + size);

        long total = 0L;
        for (Slice slice : slices) {
            if (slice.value > 0L) {
                total += slice.value;
            }
        }

        if (total <= 0L) {
            textPaint.setTextSize(dp(15));
            canvas.drawText("No data yet", width / 2f, height / 2f, textPaint);
            return;
        }

        float start = -90f;
        for (Slice slice : slices) {
            if (slice.value <= 0L) {
                continue;
            }
            float sweep = 360f * slice.value / total;
            slicePaint.setColor(slice.color);
            canvas.drawArc(bounds, start, sweep, true, slicePaint);
            start += sweep;
        }

        float radius = size * 0.28f;
        canvas.drawCircle(width / 2f, height / 2f, radius, centerPaint);
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    public static class Slice {
        public final String label;
        public final long value;
        public final int color;

        public Slice(String label, long value, int color) {
            this.label = label;
            this.value = value;
            this.color = color;
        }
    }
}
