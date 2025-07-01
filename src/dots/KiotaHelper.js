export class KiotaHelper {
    static traverseAndFlatten(obj) {
        if (Array.isArray(obj)) {
            return obj.map((item) => KiotaHelper.traverseAndFlatten(item));
        }
        else if (typeof obj === "object" && obj !== null) {
            const flattenedObj = {};
            for (const key in obj) {
                if (key === "additionalData" && typeof obj[key] === "object") {
                    Object.assign(flattenedObj, KiotaHelper.traverseAndFlatten(obj[key]));
                }
                else {
                    flattenedObj[key] = KiotaHelper.traverseAndFlatten(obj[key]);
                }
            }
            return flattenedObj;
        }
        return obj;
    }
    static unwrapKiota(obj) {
        if (Array.isArray(obj)) {
            return obj.map(KiotaHelper.unwrapKiota);
        }
        if (obj && typeof obj === "object") {
            if (Object.keys(obj).length >= 1 &&
                "value" in obj &&
                typeof obj.getValue === "function") {
                return KiotaHelper.unwrapKiota(obj.value);
            }
            const result = {};
            for (const key in obj) {
                result[key] = KiotaHelper.unwrapKiota(obj[key]);
            }
            return result;
        }
        return obj;
    }
    static flattenAndUnwrap(obj) {
        return KiotaHelper.unwrapKiota(KiotaHelper.traverseAndFlatten(obj));
    }
}
