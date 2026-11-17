package cl.monaymarket.pos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app (no vienen de npm): se registran antes de iniciar el puente.
        registerPlugin(SumUpTapToPayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
