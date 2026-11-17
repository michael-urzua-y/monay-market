package cl.monaymarket.pos

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.sumup.taptopay.TapToPay
import com.sumup.taptopay.TapToPayApiProvider
import com.sumup.taptopay.auth.AuthTokenProvider
import com.sumup.taptopay.exception.api.TapToPayException
import com.sumup.taptopay.payment.domain.model.api.AffiliateModel
import com.sumup.taptopay.payment.domain.model.api.CheckoutData
import com.sumup.taptopay.payment.domain.model.api.PaymentEvent
import com.sumup.taptopay.payment.domain.model.api.PaymentOutput
import com.sumup.taptopay.payment.domain.model.api.ProcessCardAs
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Cobro con tarjeta en el celular del cajero con el SDK SumUp Tap to Pay.
 *
 * La caja (pos/src/card-payment.js) llama:
 *  - init({ accessToken }): prepara el SDK con la clave del negocio que entrega
 *    el servidor (GET /tenant/card-payment). La clave queda solo en memoria.
 *  - startPayment({ amount, processCardAs, instalments, affiliateKey, foreignTransactionId }):
 *    abre la pantalla de SumUp y resuelve con { status, txCode, ... }. Los
 *    resultados del cobro (aprobado, rechazado, cancelado, incierto) siempre
 *    resuelven; solo se rechaza por un uso incorrecto (datos faltantes, etc.).
 *  - tearDown(): al cerrar sesión, borra la sesión de SumUp del celular.
 */
@CapacitorPlugin(name = "SumUpTapToPay")
class SumUpTapToPayPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val initMutex = Mutex()
    private val tapToPay: TapToPay by lazy { TapToPayApiProvider.provide(context.applicationContext) }

    @Volatile private var accessToken: String? = null
    private var initializedWith: String? = null
    private var paymentJob: Job? = null

    /** El SDK pide la clave cada vez que la necesita; se entrega la vigente. */
    private val tokenProvider = object : AuthTokenProvider {
        override fun getAccessToken(): String = accessToken.orEmpty()
    }

    @PluginMethod
    fun init(call: PluginCall) {
        val token = call.getString("accessToken")?.trim()
        if (token.isNullOrEmpty()) {
            call.reject("Falta la clave de SumUp del negocio", "MISSING_TOKEN")
            return
        }
        scope.launch {
            initMutex.withLock {
                if (initializedWith == token) {
                    call.resolve()
                    return@withLock
                }
                // Cambió la clave (otro negocio u otra cuenta): se cierra la sesión anterior.
                if (initializedWith != null) {
                    tapToPay.tearDown()
                    initializedWith = null
                }
                accessToken = token
                tapToPay.init(tokenProvider)
                    .onSuccess {
                        initializedWith = token
                        call.resolve()
                    }
                    .onFailure { error ->
                        if (error is TapToPayException && error.code == SDK_ALREADY_INITIALIZED) {
                            initializedWith = token
                            call.resolve()
                        } else {
                            accessToken = null
                            call.reject(error.message ?: "No se pudo preparar el cobro con tarjeta", errorCode(error))
                        }
                    }
            }
        }
    }

    @PluginMethod
    fun startPayment(call: PluginCall) {
        val amount = call.getLong("amount")
        val affiliateKey = call.getString("affiliateKey")?.trim()
        val cardType = call.getString("processCardAs")
        val instalments = call.getInt("instalments") ?: 1

        if (amount == null || amount <= 0) {
            call.reject("Monto inválido", "INVALID_AMOUNT")
            return
        }
        if (affiliateKey.isNullOrEmpty()) {
            call.reject("Falta la clave de afiliado de SumUp", "MISSING_AFFILIATE_KEY")
            return
        }
        // En Chile SumUp exige indicar débito o crédito en cada cobro.
        val processCardAs = when (cardType) {
            "debit" -> ProcessCardAs.Debit
            "credit" -> ProcessCardAs.Credit(instalments.coerceAtLeast(1))
            else -> {
                call.reject("Indique si la tarjeta es de débito o crédito", "MISSING_CARD_TYPE")
                return
            }
        }

        scope.launch {
            if (initializedWith == null) {
                call.reject("El cobro con tarjeta no está listo", "NOT_INITIALIZED")
                return@launch
            }
            if (paymentJob?.isActive == true) {
                call.reject("Ya hay un cobro con tarjeta en curso", "PAYMENT_IN_PROGRESS")
                return@launch
            }

            var settled = false
            fun settle(result: JSObject) {
                if (settled) return
                settled = true
                call.resolve(result)
            }

            val checkout = CheckoutData(
                // CLP no tiene decimales, pero el SDK recibe el monto x100 (igual que HUF/COP)
                totalAmount = amount * 100,
                tipsAmount = null,
                vatAmount = null,
                clientUniqueTransactionId = UUID.randomUUID().toString(),
                customItems = null,
                priceItems = null,
                products = null,
                processCardAs = processCardAs,
                affiliateData = AffiliateModel(
                    key = affiliateKey,
                    foreignTransactionId = call.getString("foreignTransactionId"),
                ),
            )

            paymentJob = scope.launch {
                // skipSuccessScreen = true: la caja muestra su propia confirmación
                // apenas SumUp aprueba, sin un toque extra del cajero.
                tapToPay.startPayment(checkout, true, null)
                    .catch { error -> settle(failed(error)) }
                    .onCompletion {
                        // El flujo terminó sin un resultado claro: no se sabe si se cobró.
                        settle(result("unknown", null).apply {
                            put("message", "SumUp no informó el resultado del cobro")
                        })
                    }
                    .collect { event ->
                        when (event) {
                            is PaymentEvent.TransactionDone -> settle(result("approved", event.paymentOutput))
                            is PaymentEvent.PaymentFlowClosedSuccessfully -> settle(result("approved", event.paymentOutput))
                            is PaymentEvent.TransactionCanceled -> settle(result("canceled", event.paymentOutput))
                            is PaymentEvent.TransactionResultUnknown -> settle(result("unknown", event.paymentOutput))
                            is PaymentEvent.TransactionFailed -> settle(
                                result("failed", event.paymentOutput).apply {
                                    event.tapToPayException?.let { put("code", it.code); put("message", it.message) }
                                },
                            )
                            else -> notifyListeners("paymentProgress", JSObject().put("event", event.javaClass.simpleName))
                        }
                    }
            }
        }
    }

    @PluginMethod
    fun tearDown(call: PluginCall) {
        scope.launch {
            initMutex.withLock {
                if (initializedWith != null) tapToPay.tearDown()
                initializedWith = null
                accessToken = null
            }
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun result(status: String, output: PaymentOutput?): JSObject = JSObject().apply {
        put("status", status)
        output?.let {
            put("txCode", it.txCode)
            put("serverTransactionId", it.serverTransactionId)
            put("cardType", it.cardType)
            put("cardScheme", it.cardScheme)
            put("lastFour", it.lastFour)
        }
    }

    private fun failed(error: Throwable): JSObject = result("failed", null).apply {
        put("code", (error as? TapToPayException)?.code)
        put("message", error.message)
    }

    private fun errorCode(error: Throwable): String =
        (error as? TapToPayException)?.code?.toString() ?: "INIT_FAILED"

    private companion object {
        const val SDK_ALREADY_INITIALIZED = 107
    }
}
