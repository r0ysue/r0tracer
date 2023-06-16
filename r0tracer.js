var isLite = false;
var ByPassTracerPid = function () {
    var fgetsPtr = Module.findExportByName("libc.so", "fgets");
    var fgets = new NativeFunction(fgetsPtr, 'pointer', ['pointer', 'int', 'pointer']);
    Interceptor.replace(fgetsPtr, new NativeCallback(function (buffer, size, fp) {
        var retval = fgets(buffer, size, fp);
        var bufstr = Memory.readUtf8String(buffer);
        if (bufstr.indexOf("TracerPid:") > -1) {
            Memory.writeUtf8String(buffer, "TracerPid:\t0");
            console.log("tracerpid replaced: " + Memory.readUtf8String(buffer));
        }
        return retval;
    }, 'pointer', ['pointer', 'int', 'pointer']));
};
// setImmediate(ByPassTracerPid);

(function () {
    let Color = { RESET: "\x1b[39;49;00m", Black: "0;01", Blue: "4;01", Cyan: "6;01", Gray: "7;11", "Green": "2;01", Purple: "5;01", Red: "1;01", Yellow: "3;01" };
    let LightColor = { RESET: "\x1b[39;49;00m", Black: "0;11", Blue: "4;11", Cyan: "6;11", Gray: "7;01", "Green": "2;11", Purple: "5;11", Red: "1;11", Yellow: "3;11" };
    var colorPrefix = '\x1b[3', colorSuffix = 'm'
    for (let c in Color) {
        if (c == "RESET") continue;
        console[c] = function (message) {
            console.log(colorPrefix + Color[c] + colorSuffix + message + Color.RESET);
        }
        console["Light" + c] = function (message) {
            console.log(colorPrefix + LightColor[c] + colorSuffix + message + Color.RESET);
        }
    }
})();
function uniqBy(array, key) {
    var seen = {};
    return array.filter(function (item) {
        var k = key(item);
        return seen.hasOwnProperty(k) ? false : (seen[k] = true);
    });
}
function hasOwnProperty(obj, name) {
    try {
        return obj.hasOwnProperty(name) || name in obj;
    } catch (e) {
        return obj.hasOwnProperty(name);
    }
}
function getHandle(object) {
    if (hasOwnProperty(object, '$handle')) {
        if (object.$handle != undefined) {
            return object.$handle;
        }
    }
    if (hasOwnProperty(object, '$h')) {
        if (object.$h != undefined) {
            return object.$h;
        }
    }
    return null;
}
//查看域值
function inspectObject(obj, input) {
    var isInstance = false;
    var obj_class = null;
    if (getHandle(obj) === null) {
        obj_class = obj.class;
    } else {
        var Class = Java.use("java.lang.Class");
        obj_class = Java.cast(obj.getClass(), Class);
        isInstance = true;
    }
    input = input.concat("Inspecting Fields: => ", isInstance, " => ", obj_class.toString());
    input = input.concat("\r\n")
    var fields = obj_class.getDeclaredFields();
    for (var i in fields) {
        if (isInstance || Boolean(fields[i].toString().indexOf("static ") >= 0)) {
            // output = output.concat("\t\t static static static " + fields[i].toString());
            var className = obj_class.toString().trim().split(" ")[1];
            // console.Red("className is => ",className);
            var fieldName = fields[i].toString().split(className.concat(".")).pop();
            var fieldType = fields[i].toString().split(" ").slice(-2)[0];
            var fieldValue = undefined;
            if (!(obj[fieldName] === undefined))
                fieldValue = obj[fieldName].value;
            input = input.concat(fieldType + " \t" + fieldName + " => ", fieldValue + " => ", JSON.stringify(fieldValue));
            input = input.concat("\r\n")
        }
    }
    return input;
}

// trace单个类的所有静态和实例方法包括构造方法 trace a specific Java Method
function traceMethod(targetClassMethod) {
    var delim = targetClassMethod.lastIndexOf(".");
    if (delim === -1) return;
    var targetClass = targetClassMethod.slice(0, delim)
    var targetMethod = targetClassMethod.slice(delim + 1, targetClassMethod.length)
    var hook = Java.use(targetClass);
    if (!hook[targetMethod]) {
        return;
    }
    var overloadCount = hook[targetMethod].overloads.length;
    console.Red("Tracing Method : " + targetClassMethod + " [" + overloadCount + " overload(s)]");
    for (var i = 0; i < overloadCount; i++) {
        hook[targetMethod].overloads[i].implementation = function () {
            //初始化输出
            var output = "";
            //画个横线
            for (var p = 0; p < 100; p++) {
                output = output.concat("==");
            }
            //域值
            if (!isLite) { output = inspectObject(this, output); }
            //进入函数
            output = output.concat("\n*** entered " + targetClassMethod);
            output = output.concat("\r\n")
            // if (arguments.length) console.Black();
            //参数
            var retval = this[targetMethod].apply(this, arguments);
            if (!isLite) {
                for (var j = 0; j < arguments.length; j++) {
                    output = output.concat("arg[" + j + "]: " + arguments[j] + " => " + JSON.stringify(arguments[j]));
                    output = output.concat("\r\n")
                }
                //调用栈
                output = output.concat(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Throwable").$new()));
                //返回值
                output = output.concat("\nretval: " + retval + " => " + JSON.stringify(retval));
            }
            // inspectObject(this)
            //离开函数
            output = output.concat("\n*** exiting " + targetClassMethod);
            //最终输出
            // console.Black(output);
            var r = parseInt((Math.random() * 7).toFixed(0));
            var i = r;
            var printOutput = null;
            switch (i) {
                case 1:
                    printOutput = console.Red;
                    break;
                case 2:
                    printOutput = console.Yellow;
                    break;
                case 3:
                    printOutput = console.Green;
                    break;
                case 4:
                    printOutput = console.Cyan;
                    break;
                case 5:
                    printOutput = console.Blue;
                    break;
                case 6:
                    printOutput = console.Gray;
                    break;
                default:
                    printOutput = console.Purple;
            }
            printOutput(output);
            return retval;
        }
    }
}


function traceClass(targetClass) {
    if (Java.available) {
        Java.perform(function () {
            JavaTraceClass(targetClass)
        })
    } else if (ObjC.available) {
        IosTraceClass(targetClass)
    } else {
        console.log("please connect to either iOS or Android device ...")
    }
}

function JavaTraceClass(targetClass) {
    //Java.use是新建一个对象哈，大家还记得么？
    var hook = Java.use(targetClass);
    //利用反射的方式，拿到当前类的所有方法
    var methods = hook.class.getDeclaredMethods();
    //建完对象之后记得将对象释放掉哈
    hook.$dispose;
    //将方法名保存到数组中
    var parsedMethods = [];
    var output = "";
    output = output.concat("\tSpec: => \r\n")
    methods.forEach(function (method) {
        output = output.concat(method.toString())
        output = output.concat("\r\n")
        parsedMethods.push(method.toString().replace(targetClass + ".", "TOKEN").match(/\sTOKEN(.*)\(/)[1]);
    });
    //去掉一些重复的值
    var Targets = uniqBy(parsedMethods, JSON.stringify);
    // targets = [];
    var constructors = hook.class.getDeclaredConstructors();
    if (constructors.length > 0) {
        constructors.forEach(function (constructor) {
            output = output.concat("Tracing ", constructor.toString())
            output = output.concat("\r\n")
        })
        Targets = Targets.concat("$init")
    }
    //对数组中所有的方法进行hook，
    Targets.forEach(function (targetMethod) {
        traceMethod(targetClass + "." + targetMethod);
    });
    //画个横线
    for (var p = 0; p < 100; p++) {
        output = output.concat("+");
    }
    console.Green(output);
}


function print_arguments(args) {
    /*
    Frida's Interceptor has no information about the number of arguments, because there is no such 
    information available at the ABI level (and we don't rely on debug symbols).
    
    I have implemented this function in order to try to determine how many arguments a method is using.
    It stops when:
        - The object is not nil
        - The argument is not the same as the one before    
     */
    var n = 100;
    var last_arg = '';
    for (var i = 2; i < n; ++i) {
        var arg = (new ObjC.Object(args[i])).toString();
        if (arg == 'nil' || arg == last_arg) {
            break;
        }
        last_arg = arg;
        return ' args' + (i-2) + ': ' + (new ObjC.Object(args[i])).toString()
    }
}

function IosTraceClass(targetClass) {
    console.log("Entering ios hooking => " + targetClass)
    if (ObjC.classes.hasOwnProperty(targetClass)) {
        //console.log("[+] Class: " + className);
        //var methods = ObjC.classes[className].$methods;
        var methods = ObjC.classes[targetClass].$ownMethods;
        methods.forEach(function (method) {
            console.log("hooking " + method);
            try {
                Interceptor.attach(ObjC.classes[targetClass][method].implementation, {
                    onEnter: function (args) {
                        this.output = ""
                        this.output = this.output.concat("[*] Detected call to: " + targetClass + " -> " + method)
                        this.output = this.output.concat("\r\n")
                        this.output = this.output.concat(print_arguments(args))
                        this.output = this.output.concat("\r\n")
                        this.output = this.output.concat(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n\t"))
                        // this.output = this.output.concat("\r\n")
                        // console.log(JSON.stringify(args))
                        // console.log(JSON.stringify(this.context, null, 4))
                        // console.log(ObjC.classes.NSThread.callStackSymbols().toString())
                    }, onLeave: function (ret) {
                        // console.log("ret value is => ",ret ,ObjC.object(ret).toString(), "=> ",JSON.stringify(ObjC.object(ret)))
                        this.output = this.output.concat("\r\nios return value => ", ret, ObjC.Object(ret).toString(), "\r\n")
                        this.output = this.output.concat("\r\n")
                        console.log(this.output)
                    }
                })
            } catch (error) {
                console.log("ios hooking failed error is => ", error)

            }
        })
    }

}

function hook(white, black, target = null) {
    if (Java.available) {
        Java.perform(function () {
            javahook(white, black, target = null)
        })
    } else if (ObjC.available) {
        ioshook(white, black)
    } else {
        console.log("please connect to either iOS or Android device ...")
    }

}

function javahook(white, black, target = null) {
    console.Red("start")
    if (!(target === null)) {
        console.LightGreen("Begin enumerateClassLoaders ...")
        Java.enumerateClassLoaders({
            onMatch: function (loader) {
                try {
                    if (loader.findClass(target)) {
                        console.Red("Successfully found loader")
                        console.Blue(loader);
                        Java.classFactory.loader = loader;
                        console.Red("Switch Classloader Successfully ! ")
                    }
                }
                catch (error) {
                    console.Red(" continuing :" + error)
                }
            },
            onComplete: function () {
                console.Red("EnumerateClassloader END")
            }
        })
    }
    console.Red("Begin Search Class...")
    var targetClasses = new Array();
    Java.enumerateLoadedClasses({
        onMatch: function (className) {
            if (className.toString().toLowerCase().indexOf(white.toLowerCase()) >= 0 &&
                (black == null || black == '' || className.toString().toLowerCase().indexOf(black.toLowerCase()) < 0)) {
                console.Black("Found Class => " + className)
                targetClasses.push(className);
                traceClass(className);
            }
        }, onComplete: function () {
            console.Black("Search Class Completed!")
        }
    })
    var output = "On Total Tracing :" + String(targetClasses.length) + " classes :\r\n";
    targetClasses.forEach(function (target) {
        output = output.concat(target);
        output = output.concat("\r\n")
    })
    console.Green(output + "Start Tracing ...")
}

function ioshook(white, black) {
    console.log("iOS begin search classed ...")
    const resolver = new ApiResolver('objc');
    var rule = '*[*' + white + '* *:*]'
    // var rule = '*[*' + white + '* *:*]';
    console.log("Search rule is => ", rule)
    const matches = resolver.enumerateMatches(rule);
    var targetClasses = new Set()
    matches.forEach((match) => {
        if (match.name.toString().toLowerCase().indexOf(String(black).toLowerCase()) < 0) {
            console.log(JSON.stringify(match) + "=>" + match["name"].toString().split('[')[1].toString().split(' ')[0])
            targetClasses.add(match["name"].toString().split('[')[1].toString().split(' ')[0])

            //     Interceptor.attach(match.address,{
            //         onEnter: function(args) {
            //         this.output = ""
            //         this.output = this.output.concat( "[*] Detected call to: " + match.name)
            //         this.output = this.output.concat(print_arguments(args))
            //         this.output = this.output.concat(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n\t"))
            //         // console.log(JSON.stringify(args))
            //         // console.log(JSON.stringify(this.context, null, 4))
            //         // console.log(ObjC.classes.NSThread.callStackSymbols().toString())
            //         } , onLeave:function(ret){
            //         // console.log("ret value is => ",ret ,ObjC.object(ret).toString(), "=> ",JSON.stringify(ObjC.object(ret)))
            //         this.output = this.output.concat("\r\nios return value => ",ret, ObjC.Object(ret).toString(),"\r\n")
            //         console.log(this.output)
            //     }
            // })
        }
    })
    targetClasses.forEach((className) => {
        console.log("ios final hooking => ", className)
        traceClass(className)
    })
}



function hookALL() {
    if (Java.available) {
        Java.perform(function () {
            JavahookALL()
        })
    } else if (ObjC.available) {
        ioshookALL()
    } else {
        console.log("please connect to either iOS or Android device ...")
    }

}


function ioshookALL() {
    console.log("[*] iOS Started: Hook all methods of all app only classes");
    var free = new NativeFunction(Module.findExportByName(null, 'free'), 'void', ['pointer'])
    var copyClassNamesForImage = new NativeFunction(Module.findExportByName(null, 'objc_copyClassNamesForImage'), 'pointer', ['pointer', 'pointer'])
    var p = Memory.alloc(Process.pointerSize)
    Memory.writeUInt(p, 0)
    var path = ObjC.classes.NSBundle.mainBundle().executablePath().UTF8String()
    var pPath = Memory.allocUtf8String(path)
    var pClasses = copyClassNamesForImage(pPath, p)
    var count = Memory.readUInt(p)
    var classesArray = new Array(count)
    for (var i = 0; i < count; i++) {
        var pClassName = Memory.readPointer(pClasses.add(i * Process.pointerSize))
        classesArray[i] = Memory.readUtf8String(pClassName)
        var className = classesArray[i]
        traceClass(className)
    }
    free(pClasses)
    console.log("[*] iOS Completed: Hook all methods of all app only classes");
}

function hookALLappClasses(loader) {
    if (loader.$className.toString().indexOf("java.lang.BootClassLoader") >= 0) {
        return
    }
    var class_BaseDexClassLoader = Java.use("dalvik.system.BaseDexClassLoader");
    var pathcl = Java.cast(loader, class_BaseDexClassLoader);
    console.log("classloader pathList", pathcl.pathList.value);
    var class_DexPathList = Java.use("dalvik.system.DexPathList");
    var dexPathList = Java.cast(pathcl.pathList.value, class_DexPathList);
    console.log("classloader dexElements:", dexPathList.dexElements.value.length);
    var class_DexFile = Java.use("dalvik.system.DexFile");
    var class_DexPathList_Element = Java.use("dalvik.system.DexPathList$Element");
    for (var i = 0; i < dexPathList.dexElements.value.length; i++) {
        var dexPathList_Element = Java.cast(dexPathList.dexElements.value[i], class_DexPathList_Element);
        // console.log("classloader .dexFile:",dexPathList_Element.dexFile.value);
        //可能为空 为空跳过
        if (dexPathList_Element.dexFile.value) {            
            var dexFile = Java.cast(dexPathList_Element.dexFile.value, class_DexFile);
            var mcookie = dexFile.mCookie.value;
            // console.log(".mCookie",dexFile.mCookie.value);
            if (dexFile.mInternalCookie.value) {
                mcookie = dexFile.mInternalCookie.value;
            }
            var classNameArr =
                dexPathList_Element.dexFile.value.getClassNameList(mcookie);
            console.log("dexFile.getClassNameList.length:", classNameArr.length);
            console.log("r0ysue-Enumerate ClassName Start");
            for (var i = 0; i < classNameArr.length; i++) {
                if (classNameArr[i].indexOf("android.") < 0 &&
                    classNameArr[i].indexOf("androidx.") < 0 &&
                    classNameArr[i].indexOf("java.") < 0 &&
                    classNameArr[i].indexOf("javax.") < 0
                ) {
                    console.log("r0ysue  ", classNameArr[i]);
                    traceClass(classNameArr[i])
                }
            }
            console.log("r0ysue-Enumerate ClassName End");
        }
    }
}

function JavahookALL() {
    console.log("Entering Android hookALL procedure ...")
    Java.enumerateClassLoaders({
        onMatch: function (loader) {
            try {
                if (loader.toString().indexOf("base.apk") >= 0 &&
                    loader.toString().indexOf(".jar") < 0) {
                    console.Red("Successfully found app specifec classloader")
                    console.Blue(loader);
                    Java.classFactory.loader = loader;
                    console.Red("Switch Classloader Successfully ! ")
                    hookALLappClasses(loader)
                }
            }
            catch (error) {
                console.Red(" continuing :" + error)
            }
        },
        onComplete: function () {
            console.Red("EnumerateClassloader END")
        }
    })

}


function main() {
    console.Purple("r0tracer begin ... !")
    //0. 增加精简模式，就是以彩虹色只显示进出函数。默认是关闭的，注释此行打开精简模式。
    //isLite = true;
    /*
    //以下三种模式，取消注释某一行以开启
    */
    //A. 简易trace单个lei
    // traceClass("ViewController")
    //B. 黑白名单trace多个函数，第一个参数是白名单(包含关键字)，第二个参数是黑名单(不包含的关键字)
    // hook("com.uzmap.pkg.EntranceActivity", "$");
    hook("ViewController","UI")
    //C. 报某个类找不到时，将某个类名填写到第三个参数，比如找不到com.roysue.check类。（前两个参数依旧是黑白名单）
    // hook("com.roysue.check"," ","com.roysue.check");    
    //D. 新增hookALL() 打开这个模式的情况下，会hook属于app自己的所有业务类，小型app可用 ，中大型app几乎会崩溃，经不起
    // hookALL()
}
/*
//setImmediate是立即执行函数，setTimeout是等待毫秒后延迟执行函数
//二者在attach模式下没有区别
//在spawn模式下，hook系统API时如javax.crypto.Cipher建议使用setImmediate立即执行，不需要延时
//在spawn模式下，hook应用自己的函数或含壳时，建议使用setTimeout并给出适当的延时(500~5000)
*/
setImmediate(main)
//
// setTimeout(main, 2000);


// 玄之又玄，众妙之门
// Frida的崩溃有时候真的是玄学，大项目一崩溃根本不知道是哪里出的问题，这也是小而专的项目也有一丝机会的原因
// Frida自身即会经常崩溃，建议多更换Frida(客/服要配套)版本/安卓版本，我自己常用的组合是两部手机，Frida12.8.0全家桶+安卓8.1.0，和Frida14.2.2全家桶+安卓10 
