import { useState } from 'react';

export function AutoComicPage() {
    const [status, setStatus] = useState('Sẵn sàng');
    const [isLoading, setIsLoading] = useState(false);

    // Kịch bản mẫu ban đầu (Đã sửa lại cấu trúc)
    const defaultStory = [
        {
            "id": 1, 
            "dialogues": [
                "Ngày xửa ngày xưa, tại một vùng quê yên bình...",
                "có hai anh em nhà kia, mồ côi cha mẹ từ sớm."
            ], 
            "image_prompt": "A comic panel. Two young Vietnamese boys standing sadly in front of a modest traditional thatched-roof house. Lush greenery around. Studio Ghibli style, detailed animation, masterpiece."
        },
        {
            "id": 2, 
            "dialogues": [
                "Người anh thì lười biếng, tham lam...",
                "còn người em thì hiền lành, chăm chỉ làm lụng quanh năm."
            ], 
            "image_prompt": "A comic panel. Split scene: on the left, the older brother sleeping lazily on a bamboo bed; on the right, the younger brother working hard in a sunny rice field wearing a conical hat. Studio Ghibli style."
        },
        {
            "id": 3, 
            "dialogues": [
                "Khi cha mẹ qua đời, người anh lấy sạch nhà cửa, ruộng vườn tốt.",
                "Chỉ chia cho người em một túp lều rách...",
                "và một cây khế ở góc vườn."
            ], 
            "image_prompt": "A comic panel. The sad younger brother walks away carrying a small bundle, walking towards a small broken bamboo hut with a giant starfruit tree full of fruits. Studio Ghibli style, vibrant colors."
        }
    ];

    const [scriptInput, setScriptInput] = useState(JSON.stringify(defaultStory, null, 2));
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1/images/generations');
    const [imageModel, setImageModel] = useState('dall-e-3');

    const handleStartTool = async () => {
        let parsedStory = [];
        try {
            parsedStory = JSON.parse(scriptInput);
            if (!Array.isArray(parsedStory)) throw new Error("Kịch bản phải là một mảng (Array).");
        } catch (e: any) {
            setStatus(`❌ Lỗi định dạng JSON: ${e.message}`);
            return;
        }

        if (!apiKey.trim()) {
            setStatus(`❌ Lỗi: Bạn phải nhập API Key để vẽ tranh!`);
            return;
        }

        setIsLoading(true);
        setStatus('Đang chạy hệ thống... Xem terminal/console để biết tiến trình chi tiết.');
        try {
            // @ts-ignore
            await window.electron.ipcRenderer.invoke('auto-comic:start', {
                voiceName: 'hoa-nu',
                apiKey: apiKey.trim(),
                baseUrl: baseUrl.trim(),
                imageModel: imageModel,
                story: parsedStory
            });
            setStatus('✅ THÀNH CÔNG! Đã tạo xong Video truyện tranh. Hãy kiểm tra thư mục Downloads của bạn.');
        } catch (error: any) {
            console.error(error);
            setStatus(`❌ Lỗi: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ padding: '2rem', color: 'white', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '1rem', color: '#6366f1' }}>📖 Trình Tạo Video Truyện Tranh (Auto Comic)</h1>
            <p style={{ marginBottom: '1rem', color: '#9ca3af' }}>
                Tool tự động sinh Giọng đọc, Tạo ảnh và Ép khung thành Video hoàn chỉnh. 
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 45%', background: '#1f2937', padding: '1rem', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '14px' }}>🔑 DALL-E API Key:</label>
                    <input 
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        style={{ width: '100%', padding: '8px', background: '#111827', color: 'white', border: '1px solid #374151', borderRadius: '4px' }}
                    />
                </div>
                <div style={{ flex: '1 1 45%', background: '#1f2937', padding: '1rem', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '14px' }}>🌐 Base URL:</label>
                    <input 
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#111827', color: 'white', border: '1px solid #374151', borderRadius: '4px' }}
                    />
                </div>
                <div style={{ flex: '1 1 100%', background: '#1f2937', padding: '1rem', borderRadius: '8px', marginTop: '-0.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb', fontSize: '14px' }}>🖼️ AI Model (Họa sĩ):</label>
                    <select 
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#111827', color: 'white', border: '1px solid #374151', borderRadius: '4px' }}
                    >
                        <option value="dall-e-3">DALL-E 3 (Đẹp nhất, yêu cầu tài khoản đã nạp tiền - Tier 1)</option>
                        <option value="dall-e-2">DALL-E 2 (Xấu hơn, nhưng dùng được cho tài khoản Free - Tier 0)</option>
                    </select>
                </div>
            </div>

            <div style={{ background: '#1f2937', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ marginBottom: '1rem', color: '#e5e7eb' }}>Nhập kịch bản (Định dạng JSON):</h3>
                <textarea 
                    value={scriptInput}
                    onChange={(e) => setScriptInput(e.target.value)}
                    style={{ 
                        flex: 1, 
                        width: '100%', 
                        background: '#111827', 
                        color: '#39ff14', 
                        padding: '1rem', 
                        borderRadius: '4px', 
                        fontFamily: 'monospace',
                        border: '1px solid #374151',
                        resize: 'none'
                    }}
                />
            </div>

            <button 
                onClick={handleStartTool}
                disabled={isLoading}
                style={{
                    background: isLoading ? '#4b5563' : '#4f46e5',
                    color: 'white',
                    padding: '16px 24px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '18px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    width: '100%'
                }}
            >
                {isLoading ? '⏳ ĐANG RENDER VIDEO...' : '🚀 CHẠY TOOL TẠO TRUYỆN'}
            </button>

            <div style={{ marginTop: '2rem', padding: '1rem', borderLeft: '4px solid #6366f1', background: '#374151', borderRadius: '0 4px 4px 0' }}>
                <h4 style={{ margin: 0, color: '#e5e7eb', marginBottom: '8px' }}>Trạng thái:</h4>
                <p style={{ margin: 0, color: status.includes('THÀNH CÔNG') ? '#34d399' : status.includes('Lỗi') ? '#f87171' : '#9ca3af' }}>
                    {status}
                </p>
            </div>
        </div>
    );
}
