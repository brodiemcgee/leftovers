import Foundation
import Supabase

public actor APIClient {
    public static let shared = APIClient()

    private let session = URLSession(configuration: .default)
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init() {
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .iso8601
        decoder = dec
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        encoder = enc
    }

    private func currentToken() async throws -> String {
        let session = try await SupabaseProvider.shared.client.auth.session
        guard let session else {
            throw NSError(domain: "Leftovers.APIClient", code: 401, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
        }
        return session.accessToken
    }

    public func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: AppEnvironment.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        var request = URLRequest(url: components!.url!)
        let token = try await currentToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        try Self.assertOK(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    public func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        var request = URLRequest(url: AppEnvironment.apiBaseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        let token = try await currentToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await session.data(for: request)
        try Self.assertOK(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    public func patch<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        var request = URLRequest(url: AppEnvironment.apiBaseURL.appendingPathComponent(path))
        request.httpMethod = "PATCH"
        let token = try await currentToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await session.data(for: request)
        try Self.assertOK(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    public func delete(_ path: String) async throws {
        var request = URLRequest(url: AppEnvironment.apiBaseURL.appendingPathComponent(path))
        request.httpMethod = "DELETE"
        let token = try await currentToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        try Self.assertOK(response: response, data: data)
    }

    private static func assertOK(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "Leftovers.APIClient", code: -1)
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? ""
            throw NSError(
                domain: "Leftovers.APIClient",
                code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: message]
            )
        }
    }
}
